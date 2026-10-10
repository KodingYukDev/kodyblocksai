import type { BlockDefinition } from "../types";
import { controlDefinitions } from "./control";
import { dataDefinitions } from "./data";
import { eventsDefinitions } from "./events";
import { looksDefinitions } from "./looks";
import { motionDefinitions } from "./motion";
import { operatorsDefinitions } from "./operators";
import { proceduresDefinitions } from "./procedures";
import { sensingDefinitions } from "./sensing";
import { shadowDefinitions } from "./shadows";
import { soundDefinitions } from "./sound";

export function allCoreDefinitions(): BlockDefinition[] {
  return [
    ...motionDefinitions,
    ...looksDefinitions,
    ...soundDefinitions,
    ...eventsDefinitions,
    ...controlDefinitions,
    ...sensingDefinitions,
    ...operatorsDefinitions,
    ...dataDefinitions,
    ...proceduresDefinitions,
    ...shadowDefinitions,
  ];
}
