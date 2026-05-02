import type { ChangedFile, ChangedLineRange } from '../../shared/types';

const DIFF_HEADER_REGEX = /^diff --git a\/.+ b\/(.+)$/;
const HUNK_HEADER_REGEX = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const BINARY_FILE_REGEX = /^Binary files /;
const DELETED_FILE_REGEX = /^\+\+\+ \/dev\/null$/;
const TS_EXTENSION_REGEX = /\.tsx?$/;

export function splitIntoFileSections(rawDiff: string): string[] {
  const sections: string[] = [];
  const lines = rawDiff.split('\n');
  let current: string[] = [];

  for (const line of lines) {
    if (DIFF_HEADER_REGEX.test(line) && current.length > 0) {
      sections.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) {
    sections.push(current.join('\n'));
  }

  return sections;
}

function extractFilePath(headerLine: string | undefined): string | null {
  const match = headerLine?.match(DIFF_HEADER_REGEX);
  if (match?.[1] === undefined) {
    return null;
  }
  return match[1];
}

export function parseFileSection(section: string): ChangedFile | null {
  const lines = section.split('\n');

  // Extract file path from diff header
  const filePath = extractFilePath(lines[0]);
  if (filePath === null) {
    return null;
  }

  // Skip non-TS files
  if (!TS_EXTENSION_REGEX.test(filePath)) {
    return null;
  }

  // Skip binary files
  if (lines.some((line) => BINARY_FILE_REGEX.test(line))) {
    return null;
  }

  // Skip deleted files
  if (lines.some((line) => DELETED_FILE_REGEX.test(line))) {
    return null;
  }

  // Parse hunks
  const lineRanges = parseHunks(lines);
  if (lineRanges.length === 0) {
    return null;
  }

  return { filePath, lineRanges };
}

type HunkState = {
  ranges: ChangedLineRange[];
  currentLine: number;
  inHunk: boolean;
  rangeStart: number | null;
};

function flushRange(state: HunkState): void {
  if (state.rangeStart !== null) {
    state.ranges.push({ start: state.rangeStart, end: state.currentLine - 1 });
    state.rangeStart = null;
  }
}

function processHunkHeader(state: HunkState, match: RegExpMatchArray): void {
  flushRange(state);
  const lineStr = match[1];
  if (lineStr === undefined) {
    return;
  }
  state.currentLine = Number.parseInt(lineStr, 10);
  state.inHunk = true;
}

function processHunkLine(state: HunkState, line: string): void {
  if (line.startsWith('+')) {
    if (state.rangeStart === null) {
      state.rangeStart = state.currentLine;
    }
    state.currentLine++;
  } else if (line.startsWith('-')) {
    flushRange(state);
  } else {
    flushRange(state);
    state.currentLine++;
  }
}

function parseHunks(lines: string[]): ChangedLineRange[] {
  const state: HunkState = { ranges: [], currentLine: 0, inHunk: false, rangeStart: null };

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_REGEX);
    if (hunkMatch) {
      processHunkHeader(state, hunkMatch);
    } else if (state.inHunk) {
      processHunkLine(state, line);
    }
  }

  flushRange(state);
  return state.ranges;
}
