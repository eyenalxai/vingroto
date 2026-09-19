import type { AccountConfig } from "@vingroto/core/config/schema"
import type { OutgoingMessage } from "@vingroto/core/protocol/outgoing"
import type { SendMailOptions } from "nodemailer"

import { describeError } from "@vingroto/core/errors"
import { AccountId } from "@vingroto/core/ids"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { createTransport } from "nodemailer"

import type { CredentialError } from "@/lib/credential/service"

import { passwordReference, usernameReference } from "@/lib/credential/refs"
import { Credential } from "@/lib/credential/service"

class SmtpError extends Schema.TaggedError<SmtpError>()("SmtpError", {
  accountId: AccountId,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

interface MailerShape {
  readonly send: (
    account: AccountConfig,
    message: OutgoingMessage,
  ) => Effect.Effect<void, SmtpError | CredentialError>
  readonly compile: (
    account: AccountConfig,
    message: OutgoingMessage,
  ) => Effect.Effect<Buffer, SmtpError>
}

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

class Mailer extends Context.Service<Mailer, MailerShape>()("vingroto/lib/mail/Mailer") {
  static readonly layer = Layer.effect(
    Mailer,
    Effect.gen(function* makeMailer() {
      const credential = yield* Credential

      const send = Effect.fn("Mailer.send")(function* sendMessage(
        account: AccountConfig,
        message: OutgoingMessage,
      ) {
        const username = yield* credential.get(usernameReference(account.id))
        const password = yield* credential.get(passwordReference(account.id))
        const transport = createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.security === "tls",
          requireTLS: account.smtp.security === "starttls",
          auth: { user: username, pass: password },
        })
        yield* Effect.tryPromise({
          try: async () => {
            await transport.sendMail(buildMessage(account, message))
          },
          catch: (cause: unknown) => toSmtpError(account, cause),
        })
      })

      const compile = Effect.fn("Mailer.compile")(function* compileMessage(
        account: AccountConfig,
        message: OutgoingMessage,
      ) {
        const transport = createTransport({ streamTransport: true, buffer: true })
        const output = yield* Effect.tryPromise({
          try: async () => transport.sendMail(buildMessage(account, message)),
          catch: (cause: unknown) => toSmtpError(account, cause),
        })
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
