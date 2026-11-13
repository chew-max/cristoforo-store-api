export async function sendWithResend(
  env,
  message,
  options = {}
) {
  if (env.APP_ENV === "sandbox") {
    console.log(
      "EMAIL SEND SUPPRESSED",
      {
        environment: "sandbox",
        subject:
          message?.subject || null
      }
    );

    return {
      id: null,
      suppressed: true
    };
  }
	
  if (!env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not configured"
    );
  }

  if (!message?.from) {
    throw new Error(
      "Email sender is not configured"
    );
  }

  const payload = {
    from:
      message.from,

    to:
      Array.isArray(
        message.to
      )
        ? message.to
        : [message.to],

    subject:
      message.subject,

    html:
      message.html
  };

  if (message.text) {
    payload.text =
      message.text;
  }

  const headers = {
    Authorization:
      `Bearer ${env.RESEND_API_KEY}`,

    "Content-Type":
      "application/json"
  };

  if (
    options.idempotencyKey
  ) {
    headers[
      "Idempotency-Key"
    ] =
      options.idempotencyKey;
  }

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers,
        body:
          JSON.stringify(
            payload
          )
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Resend email failed: ${response.status} ${
        data?.message ||
        JSON.stringify(data)
      }`
    );
  }

  return data;
}