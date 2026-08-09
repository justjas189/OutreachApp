export const TEMPLATE_VARIABLES = [
  "NAME",
  "EMAIL",
  "LINK",
  "BUSINESS_TYPE",
  "CITY",
  "GUIDE_TITLE",
  "AUDIENCE",
  "SERVICES",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateContext = Record<TemplateVariable, string>;

const variablePattern = /{{\s*([^{}]+?)\s*}}/g;
const allowedVariables = new Set<string>(TEMPLATE_VARIABLES);

export function validateTemplateVariables(template: string): string[] {
  return [...template.matchAll(variablePattern)]
    .map((match) => match[1].trim())
    .filter((variable, index, variables) => !allowedVariables.has(variable) && variables.indexOf(variable) === index);
}

function sanitizeValue(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[\r\n]+/g, " ").trim();
}

export function renderTemplate(template: string, context: TemplateContext): string {
  const unsupported = validateTemplateVariables(template);
  if (unsupported.length > 0) {
    throw new Error(`Unsupported template variables: ${unsupported.join(", ")}`);
  }

  return template.replace(variablePattern, (_match, variable: TemplateVariable) => sanitizeValue(context[variable]));
}

export function renderEmailTemplates(
  subjectTemplate: string,
  bodyTemplate: string,
  context: TemplateContext,
): { subject: string; body: string } {
  const subject = renderTemplate(subjectTemplate, context).replace(/\s+/g, " ").trim();
  const body = renderTemplate(bodyTemplate, context).trim();

  if (!subject || subject.length > 200 || !body || body.length > 50000) {
    throw new Error("Rendered email content is outside supported limits.");
  }

  return { subject, body };
}
