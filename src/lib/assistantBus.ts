// Opens the Assistente MYND from anywhere (e.g. "Modifica con l'AI" on a mini-app), with a message
// ready to complete and the mini-app it is about.
export interface AssistantRequest { text: string; appId?: string }

export function openAssistant(text: string, appId?: string) {
  window.dispatchEvent(new CustomEvent<AssistantRequest>('mynd-assistant', { detail: { text, appId } }));
}
