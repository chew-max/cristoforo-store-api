import {
  getStoreConfig
} from "../config/store.js";

import {
  sendWithResend
} from "./resend.js";


export function getEmailProvider(
  env
) {
  const storeConfig =
    getStoreConfig(env);

  const provider =
    storeConfig.emailProvider;

  switch (provider) {
    case "resend":
      return {
        send(
          message,
          options
        ) {
          return sendWithResend(
            env,
            message,
            options
          );
        }
      };

    default:
      throw new Error(
        `Unsupported email provider: ${provider}`
      );
  }
}