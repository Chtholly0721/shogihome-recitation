<template>
  <dialog
    ref="dialog"
    class="message-box"
    :class="messageStyleClass"
    :style="dragStyle"
    @mousedown="onDragMouseDown"
  >
    <div class="message-area">
      <Icon :icon="IconType.INFO" />
      <div class="message">
        <div v-for="(line, index) of store.message.text.split('\n')" :key="index">
          {{ line }}
        </div>
      </div>
    </div>
    <div v-for="(attachment, aidx) in store.message.attachments" :key="aidx" class="attachment">
      <ul v-if="attachment.type === 'list'" class="list">
        <li v-for="(item, iidx) in attachment.items" :key="iidx" class="list-item">
          {{ item.text }}
          <ul>
            <li v-for="(child, cidx) in item.children" :key="cidx" class="list-child-item">
              {{ child }}
            </li>
          </ul>
        </li>
      </ul>
      <button v-if="attachment.type === 'link'" @click="api.openWebBrowser(attachment.url)">
        {{ attachment.text }}
      </button>
    </div>
    <div v-if="store.message.withCopyButton">
      <button @click="copyMessage"><Icon :icon="IconType.COPY" />{{ t.copy }}</button>
    </div>
    <div class="main-buttons">
      <button autofocus data-hotkey="Escape" @click="onClose()">
        {{ t.close }}
      </button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { t } from "@/common/i18n";
import { showModalDialog } from "@/renderer/helpers/dialog.js";
import { useDraggableDialog } from "@/renderer/helpers/draggable";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { useMessageStore } from "@/renderer/store/message";
import api from "@/renderer/ipc/api";
import { toMarkdown } from "@/common/message";

const store = useMessageStore();
const dialog = ref<HTMLDialogElement>();

const { dragStyle, onDragMouseDown } = useDraggableDialog(dialog);

const messageStyleClass = computed(() => `message-${store.message.style || "info"}`);

let autoCloseTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  showModalDialog(dialog.value!, onClose);
  installHotKeyForDialog(dialog.value!);
  // duration が指定されている場合は自動で閉じる。
  const duration = store.message.duration;
  if (duration !== undefined && duration > 0) {
    autoCloseTimer = setTimeout(() => {
      onClose();
    }, duration);
  }
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value!);
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = undefined;
  }
});

const copyMessage = () => {
  navigator.clipboard.writeText(toMarkdown(store.message));
};

const onClose = () => {
  store.dequeue();
};
</script>

<style scoped>
.attachment {
  text-align: center;
}
.attachment:not(:first-child) {
  margin-top: 5px;
}
.list {
  text-align: left;
}
dialog button .icon {
  margin-right: 0.5em;
}
/* メッセージボックスの配色 */
dialog.message-box.message-success {
  color: var(--info-dialog-color);
  background-color: var(--info-dialog-bg-color);
  border-color: var(--info-dialog-border-color);
}
dialog.message-box.message-error {
  color: var(--error-dialog-color);
  background-color: var(--error-dialog-bg-color);
  border-color: var(--error-dialog-border-color);
}
</style>
