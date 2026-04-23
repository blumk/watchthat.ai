import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// Vercel's 2-core CI under concurrent jest load can blow past the default
// 1000ms waitFor budget before a chain of microtask-scheduled setStates
// settles. 3000ms is generous locally and keeps CI green.
configure({ asyncUtilTimeout: 3000 });
