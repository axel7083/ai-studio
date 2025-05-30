<script lang="ts">
import { conversations } from '../stores/conversations';
import { studioClient } from '/@/utils/client';
import {
  isAssistantChat,
  isPendingChat,
  isUserChat,
  isSystemPrompt,
  isChatMessage,
  isErrorMessage,
  isAssistantToolCall,
  type Message,
} from '@shared/models/IPlaygroundMessage';
import { catalog } from '../stores/catalog';
import ContentDetailsLayout from '../lib/ContentDetailsLayout.svelte';
import RangeInput from '../lib/RangeInput.svelte';
import Fa from 'svelte-fa';

import ChatMessage from '../lib/conversation/ChatMessage.svelte';
import SystemPromptBanner from '/@/lib/conversation/SystemPromptBanner.svelte';
import { inferenceServers } from '/@/stores/inferenceServers';
import { faCircleInfo, faPaperPlane, faStop } from '@fortawesome/free-solid-svg-icons';
import { Button, Tooltip, DetailsPage, StatusIcon } from '@podman-desktop/ui-svelte';
import { router } from 'tinro';
import ConversationActions from '../lib/conversation/ConversationActions.svelte';
import { ContainerIcon } from '@podman-desktop/ui-svelte/icons';
import ToolCallMessage from '/@/lib/conversation/ToolCallMessage.svelte';
import type { InferenceServer } from '@shared/models/IInference';
import type { ModelOptions } from '@shared/models/IModelOptions';

interface Props {
  playgroundId: string;
}

let { playgroundId }: Props = $props();

let prompt: string = $state('');
let scrollable: Element | undefined = $state();
let errorMsg = $state('');
let cancellationTokenId: number | undefined = $state(undefined);

// settings
let temperature = $state(0.8);
let max_tokens = $state(-1);
let top_p = $state(0.5);

let conversation = $derived($conversations.find(conversation => conversation.id === playgroundId));
let messages = $derived(
  conversation?.messages.filter(message => isChatMessage(message)).filter(message => !isSystemPrompt(message)) ?? [],
);
let model = $derived($catalog.models.find(model => model.id === conversation?.modelId));
let completion_tokens = $derived(conversation?.usage?.completion_tokens ?? 0);
let prompt_tokens = $derived(conversation?.usage?.prompt_tokens ?? 0);

// Find latest message of the conversation
let latest: Message | undefined = $derived(conversation?.messages[conversation.messages.length - 1]);

let inProgress = $state(false);
let sendEnabled = $derived.by(() => {
  if (inProgress) {
    return false;
  }
  if (latest) {
    if (isSystemPrompt(latest) || (isAssistantChat(latest) && !isPendingChat(latest))) {
      return true;
    }
    if (isErrorMessage(latest)) {
      return true;
    }
  } else {
    return true;
  }
  return false;
});

$effect(() => {
  if (latest && isErrorMessage(latest)) {
    errorMsg = latest.error;
  }
});

let server: InferenceServer | undefined = $derived(
  $inferenceServers.find(is => !!conversation && is.models.map(mi => mi.id).includes(conversation?.modelId)),
);

function askPlayground(): void {
  errorMsg = '';
  inProgress = true;
  const options: ModelOptions = {
    temperature,
    top_p,
    stream_options: { include_usage: true },
  };
  if (max_tokens > 0) {
    options.max_tokens = max_tokens;
  }
  studioClient
    .submitPlaygroundMessage(playgroundId, prompt, options)
    .then(token => {
      cancellationTokenId = token;
    })
    .catch((err: unknown) => {
      errorMsg = String(err);
    })
    .finally(() => {
      inProgress = false;
    });
  prompt = '';
}

$effect(() => {
  if (!conversation) {
    router.goto('/playgrounds');
    return;
  }
  if (!latest) {
    return;
  }
  if (isUserChat(latest) || (isAssistantChat(latest) && isPendingChat(latest))) {
    if (scrollable) scrollToBottom(scrollable).catch(err => console.error(`Error scrolling to bottom:`, err));
  }
});

function requestFocus(element: HTMLElement): void {
  element.focus();
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    askPlayground();
    e.preventDefault();
  }
}

async function scrollToBottom(element: Element): Promise<void> {
  element.scroll?.({ top: element.scrollHeight, behavior: 'smooth' });
}

function isHealthy(status?: string, health?: string): boolean {
  return status === 'running' && (!health || health === 'healthy');
}

function getStatusForIcon(status?: string, health?: string): string {
  switch (status) {
    case 'running':
      switch (health) {
        case 'healthy':
          return 'RUNNING';
        case 'starting':
          return 'STARTING';
        default:
          return 'NOT-RUNNING';
      }
    default:
      return 'NOT-RUNNING';
  }
}

function getStatusText(status?: string, health?: string): string {
  switch (status) {
    case 'running':
      switch (health) {
        case 'healthy':
          return 'Model Service running';
        case 'starting':
          return 'Model Service starting';
        default:
          return 'Model Service not running';
      }
    default:
      return 'Model Service not running';
  }
}

function getSendPromptTitle(sendEnabled: boolean, status?: string, health?: string): string | undefined {
  if (!isHealthy(status, health)) {
    return getStatusText(status, health);
  } else if (!sendEnabled) {
    return 'Please wait, assistant is replying';
  }
  return undefined;
}

export function goToUpPage(): void {
  router.goto('/playgrounds');
}

function handleOnClick(): void {
  if (cancellationTokenId) {
    studioClient
      .requestCancelToken(cancellationTokenId)
      .catch(err => console.error(`Error request cancel token ${cancellationTokenId}`, err));
  }
}
</script>

{#if conversation}
  <div class="overflow-auto h-full">
    <DetailsPage
      title={conversation?.name}
      breadcrumbLeftPart="Playgrounds"
      breadcrumbRightPart={conversation?.name}
      breadcrumbTitle="Go back to Playgrounds"
      onclose={goToUpPage}
      onbreadcrumbClick={goToUpPage}>
      <svelte:fragment slot="icon">
        <div class="mr-3">
          <StatusIcon
            icon={ContainerIcon}
            size={24}
            status={getStatusForIcon(server?.status, server?.health?.Status)} />
        </div>
      </svelte:fragment>
      <svelte:fragment slot="subtitle">
        <div class="flex gap-x-2 items-center text-[var(--pd-content-sub-header)]">
          {#if model}
            <div class="text-sm" aria-label="Model name">
              <a href="/model/{model.id}">{model.name}</a>
            </div>
          {/if}
        </div>
      </svelte:fragment>
      <svelte:fragment slot="actions">
        <ConversationActions detailed conversation={conversation} />
      </svelte:fragment>
      <svelte:fragment slot="content">
        <div class="flex flex-col w-full h-full bg-[var(--pd-content-bg)]">
          <div class="h-full overflow-auto" bind:this={scrollable}>
            <ContentDetailsLayout
              detailsTitle="Settings"
              detailsLabel="settings"
              detailsSummary="Playground Settings: edit model parameters and view metrics">
              <svelte:fragment slot="content">
                <div class="flex flex-col w-full h-full grow overflow-auto">
                  <div aria-label="conversation" class="w-full h-full">
                    {#if conversation}
                      <!-- Show a banner for the system prompt -->
                      {#key conversation.messages.length}
                        <SystemPromptBanner conversation={conversation} />
                      {/key}
                      <!-- show all message except the system prompt -->
                      <ul>
                        {#each messages as message (message.id)}
                          <li>
                            {#if isAssistantToolCall(message)}
                              <ToolCallMessage message={message} />
                            {:else}
                              <ChatMessage message={message} />
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                </div>
              </svelte:fragment>
              <svelte:fragment slot="details">
                <div class="text-[var(--pd-content-card-text)]">Next prompt will use these settings</div>
                <div
                  class="bg-[var(--pd-content-card-inset-bg)] text-[var(--pd-content-card-text)] w-full rounded-md p-4">
                  <div class="mb-4 flex flex-col">Model Parameters</div>
                  <div class="flex flex-col space-y-4" aria-label="parameters">
                    <div class="flex flex-row">
                      <div class="w-full">
                        <RangeInput name="temperature" min="0" max="2" step="0.1" bind:value={temperature} />
                      </div>
                      <Tooltip left>
                        <Fa class="text-[var(--pd-content-card-icon)]" icon={faCircleInfo} />
                        <svelte:fragment slot="tip">
                          <div class="inline-block py-2 px-4 rounded-md" aria-label="tooltip">
                            What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the
                            output more random, while lower values like 0.2 will make it more focused and deterministic.
                          </div>
                        </svelte:fragment>
                      </Tooltip>
                    </div>
                    <div class="flex flex-row">
                      <div class="w-full">
                        <RangeInput name="max tokens" min="-1" max="32768" step="1" bind:value={max_tokens} />
                      </div>
                      <Tooltip left>
                        <Fa class="text-[var(--pd-content-card-icon)]" icon={faCircleInfo} />
                        <svelte:fragment slot="tip">
                          <div class="inline-block py-2 px-4 rounded-md" aria-label="tooltip">
                            The maximum number of tokens that can be generated in the chat completion.
                          </div>
                        </svelte:fragment>
                      </Tooltip>
                    </div>
                    <div class="flex flex-row">
                      <div class="w-full">
                        <RangeInput name="top-p" min="0" max="1" step="0.1" bind:value={top_p} />
                      </div>
                      <Tooltip left>
                        <Fa class="text-[var(--pd-content-card-icon)]" icon={faCircleInfo} />
                        <svelte:fragment slot="tip">
                          <div class="inline-block py-2 px-4 rounded-md" aria-label="tooltip">
                            An alternative to sampling with temperature, where the model considers the results of the
                            tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10%
                            probability mass are considered.
                          </div>
                        </svelte:fragment>
                      </Tooltip>
                    </div>
                  </div>
                </div>
                <div class="text-[var(--pd-content-card-text)]">Model metrics</div>
                <div
                  class="bg-[var(--pd-content-card-inset-bg)] text-[var(--pd-content-card-text)] w-full rounded-md p-4">
                  <div class="flex flex-col space-y-4" aria-label="metrics">
                    <div class="flex flex-row">
                      <div class="w-full">
                        PROMPT TOKENS
                        <div class="flex flex-row">
                          {prompt_tokens}
                        </div>
                      </div>
                      <Tooltip left>
                        <Fa class="text-[var(--pd-content-card-icon)]" icon={faCircleInfo} />
                        <svelte:fragment slot="tip">
                          <div class="inline-block py-2 px-4 rounded-md" aria-label="tooltip">
                            The number of tokens in the prompt is used as input to the model.
                          </div>
                        </svelte:fragment>
                      </Tooltip>
                    </div>
                    <div class="flex flex-row">
                      <div class="w-full">
                        COMPLETION TOKENS
                        <div class="flex flex-row">
                          {completion_tokens}
                        </div>
                      </div>
                      <Tooltip left>
                        <Fa class="text-[var(--pd-content-card-icon)]" icon={faCircleInfo} />
                        <svelte:fragment slot="tip">
                          <div class="inline-block py-2 px-4 rounded-md" aria-label="tooltip">
                            The number of tokens in the model's output to the prompt that has been used as an input to
                            the model.
                          </div>
                        </svelte:fragment>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </svelte:fragment>
            </ContentDetailsLayout>
          </div>
          {#if errorMsg}
            <div class="text-[var(--pd-input-field-error-text)] p-2" aria-label="error" role="alert">{errorMsg}</div>
          {/if}
          <div class="flex flex-row flex-none w-full px-4 py-2 bg-[var(--pd-content-card-bg)]">
            <textarea
              aria-label="prompt"
              bind:value={prompt}
              use:requestFocus
              onkeydown={handleKeydown}
              rows="2"
              class="w-full p-2 outline-hidden rounded-xs bg-[var(--pd-content-card-inset-bg)] text-[var(--pd-content-card-text)] placeholder-[var(--pd-content-card-text)]"
              placeholder="Type your prompt here"
              disabled={!sendEnabled}></textarea>

            <div class="flex-none text-right m-4">
              {#if !sendEnabled && cancellationTokenId !== undefined}
                <Button title="Stop" icon={faStop} type="secondary" on:click={handleOnClick} />
              {:else}
                <Button
                  inProgress={!sendEnabled}
                  disabled={!isHealthy(server?.status, server?.health?.Status) || !prompt?.length}
                  on:click={askPlayground}
                  icon={faPaperPlane}
                  type="secondary"
                  title={getSendPromptTitle(sendEnabled, server?.status, server?.health?.Status)}
                  aria-label="Send prompt"></Button>
              {/if}
            </div>
          </div>
        </div>
      </svelte:fragment>
    </DetailsPage>
  </div>
{/if}
