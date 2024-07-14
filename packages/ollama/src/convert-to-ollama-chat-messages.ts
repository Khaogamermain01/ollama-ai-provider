import {
  LanguageModelV1FunctionTool,
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import { convertUint8ArrayToBase64 } from "@ai-sdk/provider-utils";

import { injectToolsSchemaIntoSystem } from "@/generate-tool/inject-tools-schema-into-system";
import { OllamaChatPrompt } from "@/ollama-chat-prompt";

export function convertToOllamaChatMessages(
  prompt: LanguageModelV1Prompt,
  tools?: LanguageModelV1FunctionTool[],
  toolChoice?: string,
  modelId: string
): OllamaChatPrompt {
  const messages: OllamaChatPrompt = [];

  let hasSystem = false;

  for (const { content, role } of prompt) {
    switch (role) {
      case "system": {
        messages.push({
          content:
            modelId === "mistral"
              ? content
              : injectToolsSchemaIntoSystem({
                  system: content,
                  toolChoice,
                  tools,
                }),
          role: "system",
        });
        hasSystem = true;
        break;
      }

      case "user": {
        const selectedTools = tools?.filter(
          (tool) => !toolChoice || tool.name === toolChoice
        );

        messages.push({
          ...content.reduce<{ content: string; images?: string[] }>(
            (previous, current) => {
              if (current.type === "image" && current.image instanceof URL) {
                throw new UnsupportedFunctionalityError({
                  functionality: "image-part",
                });
              } else if (
                current.type === "image" &&
                current.image instanceof Uint8Array
              ) {
                previous.images = previous.images || [];
                previous.images.push(convertUint8ArrayToBase64(current.image));
              }

              return previous;
            },
            {}
          ),
          role: "user",
          content:
            modelId === "mistral"
              ? `
            [AVAILABLE_TOOLS] ${JSON.stringify(
              selectedTools
            )} [/AVAILABLE_TOOLS]
            [INST] ${
              content.reduce<{ content: string; images?: string[] }>(
                (previous, current) => {
                  if (current.type === "text") {
                    previous.content += current.text;
                  }
                  return previous;
                },
                { content: "" }
              ).content
            } [/INST]
          `.trim()
              : content.reduce<{ content: string; images?: string[] }>(
                  (previous, current) => {
                    if (current.type === "text") {
                      previous.content += current.text;
                    }
                    return previous;
                  },
                  { content: "" }
                ).content,
        });
        break;
      }

      case "assistant": {
        messages.push({
          content: content
            .map((part) => {
              switch (part.type) {
                case "text": {
                  return part.text;
                }
              }
            })
            .join(""),
          role: "assistant",
        });
        break;
      }

      case "tool": {
        messages.push({
          content: content,
          role: "tool",
        });
        break;
      }

      default: {
        const _exhaustiveCheck: string = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  if (!hasSystem && tools && modelId !== "mistral") {
    messages.unshift({
      content: injectToolsSchemaIntoSystem({
        system: "",
        toolChoice,
        tools,
      }),
      role: "system",
    });
  }

  return messages;
}
