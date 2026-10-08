// Prints the evaluation set, the prototypes and the training set as JSON, for evaluate.py and train.py.
import { WORK_SAMPLES } from "../../src/insights/eval/work-samples.ts";
import { TRAINING_EXAMPLES } from "../../src/insights/train/index.ts";
import { TUNING_EXAMPLES } from "../../src/insights/train/tuning.ts";
import { WORK_PROTOTYPES } from "../../src/insights/work-prototypes.ts";

// Bun.write, not console.log: piped, console.log split a multibyte character at a buffer boundary.
await Bun.write(Bun.stdout, `${JSON.stringify({ samples: WORK_SAMPLES, prototypes: WORK_PROTOTYPES, training: TRAINING_EXAMPLES, tuning: TUNING_EXAMPLES })}\n`);
