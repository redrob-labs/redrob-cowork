// Prints the evaluation set, the prototypes and the training set as JSON, for evaluate.py and train.py.
import { WORK_SAMPLES } from "../../src/insights/eval/work-samples.ts";
import { TRAINING_EXAMPLES } from "../../src/insights/train/index.ts";
import { WORK_PROTOTYPES } from "../../src/insights/work-prototypes.ts";

console.log(JSON.stringify({ samples: WORK_SAMPLES, prototypes: WORK_PROTOTYPES, training: TRAINING_EXAMPLES }));
