import { expect, test } from "vite-plus/test";
import { benchmarkRows } from "../../../eval/lib/benchmark.js";

test("benchmark reporter times normalize whole-set samples to one scheme", () => {
  const text = JSON.stringify({
    testResults: [
      {
        assertionResults: [
          {
            title: "whole set",
            status: "passed",
            meta: { schemesPerSample: 11, variant: "tonal" },
            benchmarks: [
              {
                tasks: [
                  {
                    name: "all 11 seeds",
                    latency: { mean: 11, p99: 22, max: 33, samplesCount: 100 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(benchmarkRows(text)).toEqual([
    {
      variant: "tonal",
      label: "whole set",
      seeds: "all 11 seeds",
      mean: 1,
      p99: 2,
      max: 3,
      samples: 100,
    },
  ]);
  expect(() => benchmarkRows(text.replace('"passed"', '"failed"'))).toThrow("Benchmark failed");
  expect(() => benchmarkRows('{"testResults":[]}')).toThrow("no results");
});
