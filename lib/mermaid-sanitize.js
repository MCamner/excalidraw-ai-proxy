import { parseMermaid } from "./mermaid-parser.js";

export function sanitizeMermaid(text) {
  return sanitizeMermaidWithReport(text).mermaid;
}

export function sanitizeMermaidWithReport(text) {
  const repairReasons = [];
  let mermaid = String(text ?? "");

  const withoutFences = mermaid
    .replace(/```mermaid/gi, "")
    .replace(/```/g, "");
  if (withoutFences !== mermaid) {
    addRepairReason(repairReasons, "stripped_prose_and_fences");
  }
  mermaid = withoutFences.trim();

  const firstMermaidLine = mermaid.search(
    /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram)\b/im,
  );
  if (firstMermaidLine > 0) {
    addRepairReason(repairReasons, "stripped_prose_and_fences");
    mermaid = mermaid.slice(firstMermaidLine).trim();
  }

  mermaid = mermaid
    .split("\n")
    .map((line) => {
      const trimmedLine = line.replace(/\s+$/g, "");
      return trimmedLine.replace(
        /(\w+)\s+--\s+([^|-][^-]*?)\s+-->\s+(\w+)/g,
        (_match, from, label, to) => {
          addRepairReason(repairReasons, "normalized_loose_edge_label");
          return `${from} -->|${label.trim()}| ${to}`;
        },
      );
    })
    .filter((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return false;
      }
      if (/^Here(?:'s| is)\b/i.test(trimmedLine)) {
        addRepairReason(repairReasons, "stripped_prose_and_fences");
        return false;
      }
      return true;
    })
    .join("\n");

  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram)\b/i.test(mermaid)) {
    addRepairReason(repairReasons, "added_default_flowchart");
    mermaid = `flowchart TD\n${mermaid}`;
  }

  if (/^(flowchart|graph)\b/i.test(mermaid)) {
    mermaid = mermaid
      .split("\n")
      .filter((line) => {
        const repairReason = flowchartStylingRepairReason(line);
        if (repairReason) {
          addRepairReason(repairReasons, repairReason);
          return false;
        }
        return true;
      })
      .map((line) => {
        const quotedLine = quoteFlowchartLabels(line);
        if (quotedLine !== line) {
          addRepairReason(repairReasons, "quoted_punctuation_labels");
        }
        return quotedLine;
      })
      .join("\n");
  }

  return {
    mermaid,
    repairApplied: repairReasons.length > 0,
    repairReasons,
  };
}

const FLOWCHART_STYLING_LINE =
  /^\s*(?:classDef\b|style\s+\S+\s+.*(?:fill|stroke|color)\s*:|class\s+[\w,\s]+\s+(?:fill|stroke|color)\s*:)/i;

function isFlowchartStylingLine(line) {
  return FLOWCHART_STYLING_LINE.test(line);
}

function flowchartStylingRepairReason(line) {
  if (!isFlowchartStylingLine(line)) {
    return "";
  }
  if (/^\s*classDef\b/i.test(line)) {
    return "stripped_classdef_line";
  }
  if (/^\s*style\s+\S+\s+.*(?:fill|stroke|color)\s*:/i.test(line)) {
    return "stripped_style_line";
  }
  return "stripped_invalid_class_line";
}

const LABEL_NEEDS_QUOTING = /[()/\\&:;#<>]/;

function quoteLabelText(inner) {
  const trimmed = inner.trim();
  if (!trimmed) {
    return inner;
  }
  if (/^".*"$/.test(trimmed) || /^[([].*[)\]]$/.test(trimmed)) {
    return inner;
  }
  if (!LABEL_NEEDS_QUOTING.test(trimmed)) {
    return inner;
  }
  return `"${trimmed.replace(/"/g, "'")}"`;
}

function quoteFlowchartLabels(line) {
  return line
    .replace(/\[([^[\]]+)\]/g, (_m, inner) => `[${quoteLabelText(inner)}]`)
    .replace(/\{([^{}]+)\}/g, (_m, inner) => `{${quoteLabelText(inner)}}`)
    .replace(/\|([^|]+)\|/g, (_m, inner) => `|${quoteLabelText(inner)}|`);
}

export async function isValidMermaid(source) {
  return Boolean(await parseMermaid(source));
}

function addRepairReason(repairReasons, reason) {
  if (!repairReasons.includes(reason)) {
    repairReasons.push(reason);
  }
}
