import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  SELF
} from "cloudflare:test";

import {
  describe,
  it,
  expect
} from "vitest";

import worker from "../src";


describe(
  "Jekyll Commerce API",
  () => {

    it(
      "returns the service health response (unit style)",
      async () => {
        const request =
          new Request(
            "http://example.com/"
          );

        const ctx =
          createExecutionContext();

        const response =
          await worker.fetch(
            request,
            env,
            ctx
          );

        await waitOnExecutionContext(
          ctx
        );

        expect(
          response.status
        ).toBe(200);

        expect(
          await response.json()
        ).toEqual({
          status: "ok",
          service:
            "jekyll-commerce-api"
        });
      }
    );


    it(
      "returns the service health response (integration style)",
      async () => {
        const response =
          await SELF.fetch(
            "http://example.com/"
          );

        expect(
          response.status
        ).toBe(200);

        expect(
          await response.json()
        ).toEqual({
          status: "ok",
          service:
            "jekyll-commerce-api"
        });
      }
    );

  }
);