export const FLORIDA_STATE_RATE = 0.06;

const FLORIDA_SURTAX_SIMPLE_LIMIT_CENTS = 500000;


const STREET_SUFFIXES = {
  STREET: "ST",
  ST: "ST",

  ROAD: "RD",
  RD: "RD",

  AVENUE: "AVE",
  AVE: "AVE",

  BOULEVARD: "BLVD",
  BLVD: "BLVD",

  DRIVE: "DR",
  DR: "DR",

  LANE: "LN",
  LN: "LN",

  COURT: "CT",
  CT: "CT",

  CIRCLE: "CIR",
  CIR: "CIR",

  HIGHWAY: "HWY",
  HWY: "HWY",

  PARKWAY: "PKWY",
  PKWY: "PKWY",

  PLACE: "PL",
  PL: "PL",

  TERRACE: "TER",
  TER: "TER",

  TRAIL: "TRL",
  TRL: "TRL",

  WAY: "WAY",
  LOOP: "LOOP"
};


const DIRECTIONS = {
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",

  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",

  N: "N",
  S: "S",
  E: "E",
  W: "W",

  NE: "NE",
  NW: "NW",
  SE: "SE",
  SW: "SW"
};


const UNIT_MARKERS = new Set([
  "APT",
  "APARTMENT",
  "UNIT",
  "STE",
  "SUITE",
  "#"
]);


export function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}


export function parseFloridaAddress(address1) {
  const normalized =
    normalizeToken(address1);


  let tokens =
    normalized
      .split(" ")
      .filter(Boolean);


  if (tokens.length < 2) {
    throw new Error(
      "Florida tax address could not be parsed."
    );
  }


  const houseNumber =
    tokens.shift();


  /*
   * Remove unit / apartment information.
   *
   * Example:
   *
   * 123 Main Street Apt 4
   *
   * becomes:
   *
   * 123 Main Street
   */
  const unitIndex =
    tokens.findIndex(
      token =>
        UNIT_MARKERS.has(token)
    );


  if (unitIndex >= 0) {
    tokens =
      tokens.slice(
        0,
        unitIndex
      );
  }


  let predir = "";
  let postdir = "";
  let streetSuffix = "";


  /*
   * Prefix directional.
   *
   * Example:
   * 123 North Main Street
   */
  if (
    tokens.length > 0 &&
    DIRECTIONS[tokens[0]]
  ) {
    predir =
      DIRECTIONS[
        tokens.shift()
      ];
  }


  /*
   * Post-directional must be removed
   * before evaluating the suffix.
   *
   * Example:
   * 123 Main Street North
   */
  if (
    tokens.length > 0 &&
    DIRECTIONS[
      tokens[
        tokens.length - 1
      ]
    ]
  ) {
    postdir =
      DIRECTIONS[
        tokens.pop()
      ];
  }


  /*
   * Normalize street suffix.
   */
  if (
    tokens.length > 0 &&
    STREET_SUFFIXES[
      tokens[
        tokens.length - 1
      ]
    ]
  ) {
    streetSuffix =
      STREET_SUFFIXES[
        tokens.pop()
      ];
  }


  const streetName =
    tokens.join(" ");


  if (
    !houseNumber ||
    !streetName
  ) {
    throw new Error(
      "Florida tax address could not be parsed."
    );
  }


  return {
    houseNumber,
    predir,
    streetName,
    streetSuffix,
    postdir
  };
}


export async function resolveFloridaCounty(
  env,
  shipping
) {
  const country =
    normalizeToken(
      shipping.country
    );


  const state =
    normalizeToken(
      shipping.state
    );


  if (
    country !== "US" ||
    state !== "FL"
  ) {
    return null;
  }


  const parsed =
    parseFloridaAddress(
      shipping.address1
    );


  const zip =
    String(
      shipping.postalCode || ""
    )
      .trim()
      .slice(0, 5);


  const city =
    normalizeToken(
      shipping.city
    );


  /*
   * Exact DOR match including mailing city.
   */
  let result =
    await env.DB
      .prepare(
        `
        SELECT
          a.county_id,
          c.county_name,
          c.surtax_rate

        FROM fl_tax_addresses a

        JOIN fl_tax_counties c
          ON c.county_id =
             a.county_id

        WHERE
          a.zip = ?
          AND a.house_number = ?
          AND a.predir = ?
          AND a.street_name = ?
          AND a.street_suffix = ?
          AND a.postdir = ?
          AND a.city = ?

        LIMIT 1
        `
      )
      .bind(
        zip,
        parsed.houseNumber,
        parsed.predir,
        parsed.streetName,
        parsed.streetSuffix,
        parsed.postdir,
        city
      )
      .first();


  if (result) {
    return buildCountyResult(
      result
    );
  }


  /*
   * Mailing cities sometimes differ
   * from user-entered city names.
   *
   * Ignore city only if the remaining
   * address identifies exactly one county.
   */
  const fallback =
    await env.DB
      .prepare(
        `
        SELECT DISTINCT
          a.county_id,
          c.county_name,
          c.surtax_rate

        FROM fl_tax_addresses a

        JOIN fl_tax_counties c
          ON c.county_id =
             a.county_id

        WHERE
          a.zip = ?
          AND a.house_number = ?
          AND a.predir = ?
          AND a.street_name = ?
          AND a.street_suffix = ?
          AND a.postdir = ?

        LIMIT 2
        `
      )
      .bind(
        zip,
        parsed.houseNumber,
        parsed.predir,
        parsed.streetName,
        parsed.streetSuffix,
        parsed.postdir
      )
      .all();


  const matches =
    fallback.results || [];


  if (matches.length !== 1) {
    return null;
  }


  return buildCountyResult(
    matches[0]
  );
}


function buildCountyResult(result) {
  const surtaxRate =
    Number(
      result.surtax_rate
    );


  return {
    countyId:
      result.county_id,

    countyName:
      result.county_name,

    stateRate:
      FLORIDA_STATE_RATE,

    surtaxRate,

    combinedRate:
      FLORIDA_STATE_RATE +
      surtaxRate
  };
}


/*
 * Florida rounding:
 *
 * Tax is carried to the third decimal
 * dollar place.
 *
 * If that third decimal is 5 or more,
 * round up to the next cent.
 *
 * Because all input values are cents,
 * we convert the rate to basis points
 * and perform integer rounding.
 */
export function calculateTaxCents(
  taxableCents,
  rate
) {
  const amount =
    Number(taxableCents);


  const basisPoints =
    Math.round(
      Number(rate) * 10000
    );


  if (
    !Number.isInteger(amount) ||
    amount < 0
  ) {
    throw new Error(
      "Taxable amount must be a non-negative integer number of cents."
    );
  }


  if (
    !Number.isInteger(
      basisPoints
    ) ||
    basisPoints < 0
  ) {
    throw new Error(
      "Tax rate is invalid."
    );
  }


  return Math.floor(
    (
      amount *
      basisPoints +
      5000
    ) /
    10000
  );
}


export async function calculateFloridaTax(
  env,
  {
    shipping,
    merchandiseSubtotal,
    shippingAmount
  }
) {
  const merchandise =
    Number(
      merchandiseSubtotal
    );


  const delivery =
    Number(
      shippingAmount
    );


  if (
    !Number.isInteger(
      merchandise
    ) ||
    merchandise < 0
  ) {
    throw new Error(
      "Merchandise subtotal must be a non-negative integer number of cents."
    );
  }


  if (
    !Number.isInteger(
      delivery
    ) ||
    delivery < 0
  ) {
    throw new Error(
      "Shipping amount must be a non-negative integer number of cents."
    );
  }


  const country =
    normalizeToken(
      shipping.country
    );


  const state =
    normalizeToken(
      shipping.state
    );


  /*
   * Current starter behavior:
   *
   * This function handles Florida sales tax.
   * Other states currently return zero.
   *
   * That is an engine behavior, not a statement
   * that the merchant can never create tax
   * obligations in another state.
   */
  if (
    country !== "US" ||
    state !== "FL"
  ) {
    return {
      taxable: false,

      jurisdiction: null,

      merchandiseSubtotal:
        merchandise,

      shippingAmount:
        delivery,

      taxableBase: 0,

      stateRate: 0,

      surtaxRate: 0,

      combinedRate: 0,

      stateTaxAmount: 0,

      surtaxAmount: 0,

      taxAmount: 0
    };
  }


  const jurisdiction =
    await resolveFloridaCounty(
      env,
      shipping
    );


  if (!jurisdiction) {
    throw new Error(
      "Unable to determine the Florida tax jurisdiction for this shipping address."
    );
  }


  /*
   * Required shipping is part of the
   * taxable Florida sales price.
   */
  const taxableBase =
    merchandise +
    delivery;


  /*
   * Florida's discretionary surtax has
   * special item-level rules above $5,000.
   *
   * Until the generic item-level allocation
   * logic is implemented, we intentionally
   * reject rather than under- or over-collect.
   */
  if (
    taxableBase >
    FLORIDA_SURTAX_SIMPLE_LIMIT_CENTS
  ) {
    throw new Error(
      "Florida orders above $5,000 require item-level discretionary surtax calculation."
    );
  }


  const stateTaxAmount =
    calculateTaxCents(
      taxableBase,
      jurisdiction.stateRate
    );


  const surtaxAmount =
    calculateTaxCents(
      taxableBase,
      jurisdiction.surtaxRate
    );


  const taxAmount =
    stateTaxAmount +
    surtaxAmount;


  return {
    taxable: true,

    jurisdiction: {
      countyId:
        jurisdiction.countyId,

      countyName:
        jurisdiction.countyName
    },

    merchandiseSubtotal:
      merchandise,

    shippingAmount:
      delivery,

    taxableBase,

    stateRate:
      jurisdiction.stateRate,

    surtaxRate:
      jurisdiction.surtaxRate,

    combinedRate:
      jurisdiction.combinedRate,

    stateTaxAmount,

    surtaxAmount,

    taxAmount
  };
}