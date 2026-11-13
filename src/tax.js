import {
  TAX_PROVIDER
} from "./tax/providers.js";

import {
  calculateTaxJarTax
} from "./tax/taxjar.js";


export async function calculateTax(
  env,
  checkout
) {

  if (!checkout) {

    throw new Error(
      "Tax calculation requires checkout data."
    );
  }


  switch (
    String(
      TAX_PROVIDER || "none"
    ).toLowerCase()
  ) {

    case "none":

      return {
        provider:
          "none",

        amount:
          0,

        rate:
          0,

        taxableAmount:
          0,

        hasNexus:
          false,

        raw:
          null
      };


    case "taxjar":

      return calculateTaxJarTax(
        env,
        checkout
      );


    default:

      throw new Error(
        `Unsupported tax provider: ${TAX_PROVIDER}`
      );
  }
}