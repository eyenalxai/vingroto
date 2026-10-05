import type { AccountConfig } from "@vingroto/core/config/schema"
import type { OutgoingMessage } from "@vingroto/core/protocol/outgoing"
import type { Mail, SendMailOptions } from "nodemailer"

import { describeError } from "@vingroto/core/errors"
import { AccountId } from "@vingroto/core/ids"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { createTransport } from "nodemailer"

import type { CredentialError } from "@/lib/credential/service"
import type { OAuthError } from "@/lib/oauth/errors"

import { usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"
import { accountSecret, smtpAuthFor } from "@/lib/mail/auth"
import { OAuth } from "@/lib/oauth"

class SmtpError extends Schema.TaggedError<SmtpError>()("SmtpError", {
  accountId: AccountId,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

interface MailerShape {
  readonly send: (
    account: AccountConfig,
    message: OutgoingMessage,
  ) => Effect.Effect<void, SmtpError | CredentialError | OAuthError>
  readonly compile: (
    account: AccountConfig,
    message: OutgoingMessage,
  ) => Effect.Effect<Buffer, SmtpError>
}

const sendDeadline = Duration.minutes(2)
const compileDeadline = Duration.seconds(30)

const buildMessage = (account: AccountConfig, message: OutgoingMessage): SendMailOptions => {
  const recipients = [...message.to, ...message.cc, ...message.bcc].map((entry) => entry.address)
  return {
    from:
      account.name === undefined || account.name.trim().length === 0
        ? account.email
        : `${account.name} <${account.email}>`,
    to: [...message.to],
    cc: [...message.cc],
    bcc: [...message.bcc],
    subject: message.subject,
    text: message.body,
    ...(message.inReplyTo === undefined ? {} : { inReplyTo: message.inReplyTo }),
    references: [...message.references],
    envelope: { from: account.email, to: recipients },
  }
}

const toSmtpError = (account: AccountConfig, cause: unknown) =>
  new SmtpError({ accountId: account.id, message: describeError(cause), cause })

const deadlineError = (account: AccountConfig, operation: string, deadline: Duration.Duration) =>
  new SmtpError({
    accountId: account.id,
    message: `${operation} timed out after ${Duration.toSeconds(deadline)}s`,
    cause: undefined,
  })

// Nodemailer has no AbortSignal support, so closing the transport is how an interrupted send is stopped.
const withTransport = <T>(
  account: AccountConfig,
  operation: string,
  deadline: Duration.Duration,
  transport: Mail<T>,
  message: SendMailOptions,
): Effect.Effect<T, SmtpError> =>
  Effect.tryPromise({
    try: (signal) => {
      const close = () => {
        transport.close()
      }
      signal.addEventListener("abort", close, { once: true })
      return transport.sendMail(message).finally(() => {
        signal.removeEventListener("abort", close)
        transport.close()
      })
    },
    catch: (cause: unknown) => toSmtpError(account, cause),
  }).pipe(
    Effect.timeoutOrElse({
      duration: deadline,
      orElse: () => Effect.fail(deadlineError(account, operation, deadline)),
    }),
  )

class Mailer extends Context.Service<Mailer, MailerShape>()("@vingroto/server/lib/mail/mailer") {
  static readonly layer = Layer.effect(
    Mailer,
    Effect.gen(function* makeMailer() {
      const credential = yield* Credential
      const oauth = yield* OAuth

      const send = Effect.fn("Mailer.send")(function* sendMessage(
        account: AccountConfig,
        message: OutgoingMessage,
      ) {
        const username = yield* credential.get(usernameReference(account.id))
        const secret = yield* accountSecret({ credential, oauth }, account)
        const transport = createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.security === "tls",
          requireTLS: account.smtp.security === "starttls",
          auth: smtpAuthFor(account, username, secret),
        })
        yield* withTransport(
          account,
          "sending the message",
          sendDeadline,
          transport,
          buildMessage(account, message),
        )
      })

      const compile = Effect.fn("Mailer.compile")(function* compileMessage(
        account: AccountConfig,
        message: OutgoingMessage,
      ) {
        const transport = createTransport({ streamTransport: true, buffer: true })
        const output = yield* withTransport(
          account,
          "compiling the message",
          compileDeadline,
          transport,
          buildMessage(account, message),
        )
        if (!Buffer.isBuffer(output.message)) {
          return yield* new SmtpError({
            accountId: account.id,
            message: "the message could not be serialized to a buffer",
            cause: undefined,
          })
        }
        return output.message
      })

      return Mailer.of({ compile, send })
    }),
  )
}

export { Mailer, SmtpError, type MailerShape }
