import {
  TAX_ORIGIN
} from "./providers.js";


const TAXJAR_API =
  "https://api.taxjar.com/v2";


async function taxJarRequest(
  env,
  path,
  options = {}
) {

  if (!env.TAXJAR_API_TOKEN) {

    throw new Error(
      "TAXJAR_API_TOKEN is not configured."
    );
  }


  const headers = {

    "Authorization":
      `Bearer ${env.TAXJAR_API_TOKEN}`,

    "Content-Type":
      "application/json",

    ...(options.headers || {})
  };


  const response =
    await fetch(
      `${TAXJAR_API}${path}`,
      {
        ...options,
        headers
      }
    );


  const text =
    await response.text();


  let data = null;


  if (text) {

    try {

      data =
        JSON.parse(text);

    } catch {

      data =
        text;
    }
  }


  if (!response.ok) {

	console.error(
	  "TAXJAR API ERROR",
	  {
		httpStatus:
		  response.status
	  }
	);


    const message =
      data?.detail ||
      data?.error ||
      `TaxJar request failed with status ${response.status}.`;


    throw new Error(
      message
    );
  }


  return data;
}


function centsToDollars(
  cents
) {

  return (
    Number(cents) / 100
  ).toFixed(2);
}


function dollarsToCents(
  amount
) {

  return Math.round(
    Number(amount) * 100
  );
}


export async function calculateTaxJarTax(
  env,
  checkout
) {

  const {
    customer,
    merchandiseSubtotal,
    shippingAmount,
    items
  } = checkout;


  if (!customer) {

    throw new Error(
      "Customer address is required for tax calculation."
    );
  }


  if (
    !TAX_ORIGIN.country ||
    !TAX_ORIGIN.state ||
    !TAX_ORIGIN.zip
  ) {

    throw new Error(
      "Tax origin is not configured."
    );
  }


  const payload = {

    from_country:
      TAX_ORIGIN.country,

    from_zip:
      TAX_ORIGIN.zip,

    from_state:
      TAX_ORIGIN.state,

    from_city:
      TAX_ORIGIN.city || "",

    from_street:
      TAX_ORIGIN.street || "",


    to_country:
      customer.country,

    to_zip:
      customer.postalCode,

    to_state:
      customer.state,

    to_city:
      customer.city,

    to_street:
      customer.address1,


    amount:
      Number(
        centsToDollars(
          merchandiseSubtotal
        )
      ),

    shipping:
      Number(
        centsToDollars(
          shippingAmount
        )
      ),


    line_items:
      items.map(
        function (
          item,
          index
        ) {

          return {

            id:
              String(
                index + 1
              ),

            quantity:
              item.quantity,

            unit_price:
              Number(
                centsToDollars(
                  item.unitPrice
                )
              ),

            product_identifier:
              item.sku,

            description:
              item.name
          };
        }
      )
  };


  console.log(
    "REQUESTING TAX QUOTE",
    {
      provider:
        "taxjar",

      destinationState:
        customer.state,

      destinationZip:
        customer.postalCode,

      merchandiseSubtotal,
      shippingAmount
    }
  );


  const data =
    await taxJarRequest(
      env,
      "/taxes",
      {
        method:
          "POST",

        body:
          JSON.stringify(
            payload
          )
      }
    );


  const tax =
    data?.tax;


  if (!tax) {

    throw new Error(
      "Tax provider returned no tax result."
    );
  }


  const taxAmount =
    dollarsToCents(
      tax.amount_to_collect || 0
    );


  if (
    !Number.isInteger(
      taxAmount
    ) ||
    taxAmount < 0
  ) {

    throw new Error(
      "Tax provider returned an invalid tax amount."
    );
  }


  console.log(
    "TAX QUOTE",
    {
      provider:
        "taxjar",

      taxAmount,

      rate:
        tax.rate || 0,

      taxableAmount:
        tax.taxable_amount || 0,

      hasNexus:
        Boolean(
          tax.has_nexus
        )
    }
  );


  return {

    provider:
      "taxjar",

    amount:
      taxAmount,

    rate:
      Number(
        tax.rate || 0
      ),

    taxableAmount:
      dollarsToCents(
        tax.taxable_amount || 0
      ),

    hasNexus:
      Boolean(
        tax.has_nexus
      ),

    raw:
      data
  };
}