<script lang="ts">
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { createEventDispatcher, onDestroy, onMount } from 'svelte';

let divEl: HTMLDivElement;
let editor: monaco.editor.IStandaloneCodeEditor;

export let content = '';
export let language = 'json';
export let readOnly = true;

const dispatch = createEventDispatcher<{ contentChange: string }>();

onMount(async () => {
  self.MonacoEnvironment = {
    getWorker: function (_moduleId: any, label: string) {
      switch (label) {
        case 'json':
          return new jsonWorker();
        default:
          return new editorWorker();
      }
    },
    createTrustedTypesPolicy: () => undefined,
  };

  monaco.editor.defineTheme('podmanDesktopTheme', {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'custom-color', background: '#0f0f11' }],
    colors: {
      'editor.background': '#0f0f11',
    },
  });

  editor = monaco.editor.create(divEl, {
    value: content,
    language,
    readOnly: readOnly,
    theme: 'podmanDesktopTheme',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    minimap: {
      enabled: false,
    },
  });

  editor.onDidChangeModelContent(() => {
    // Emit the content change so we can use it in the parent component
    dispatch('contentChange', editor.getValue());
  });

  editor.onDidContentSizeChange(() => {
    divEl.style.height = `${Math.min(1000, editor.getContentHeight())}px`;
    editor.layout();
  });

  window.addEventListener('resize', onResize);
});

function onResize() {
  editor.layout({ width: 0, height: 0 });
  window.requestAnimationFrame(() => {
    const rect = divEl.getBoundingClientRect();
    editor.layout({ width: rect.width, height: rect.height });
  });
}

onDestroy(() => {
  window.removeEventListener('resize', onResize);
  editor?.dispose();
});

$: content, editor?.getModel()?.setValue(content);
</script>

<div bind:this="{divEl}"></div>
