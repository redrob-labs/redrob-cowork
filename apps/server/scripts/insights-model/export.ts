// Prints the evaluation set and the classifier prototypes as JSON, for evaluate.py.
import { WORK_SAMPLES } from "../../src/insights/eval/work-samples.ts";
import { WORK_PROTOTYPES } from "../../src/insights/work-prototypes.ts";

console.log(JSON.stringify({ samples: WORK_SAMPLES, prototypes: WORK_PROTOTYPES }));
