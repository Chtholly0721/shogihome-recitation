<template>
  <dialog ref="dialog" class="mobile-recitation">
    <div class="header">
      <span class="header-item">{{
        t.plyNofM(recitation?.currentPly ?? 0, recitation?.totalPly ?? 0)
      }}</span>
      <span class="header-item">{{ turnText }}</span>
      <span class="header-item">{{ t.mistakeCount }}: {{ recitation?.mistakeCount ?? 0 }}</span>
      <span class="header-item">{{ elapsedText }}</span>
      <button class="close-button" @click="requestClose">
        <Icon :icon="IconType.CLOSE" />
      </button>
    </div>
    <div class="board-view">
      <BoardView
        :layout-type="layoutType"
        :board-image-type="appSettings.boardImage"
        :custom-board-image-url="
          appSettings.boardImageFileURL && fileURLToCustomSchemeURL(appSettings.boardImageFileURL)
        "
        :board-image-opacity="appSettings.enableTransparent ? appSettings.boardOpacity : 1"
        :board-grid-color="appSettings.boardGridColor || undefined"
        :piece-stand-image-type="appSettings.pieceStandImage"
        :custom-piece-stand-image-url="
          appSettings.pieceStandImageFileURL &&
          fileURLToCustomSchemeURL(appSettings.pieceStandImageFileURL)
        "
        :piece-stand-image-opacity="
          appSettings.enableTransparent ? appSettings.pieceStandOpacity : 1
        "
        :hand-piece-order="appSettings.handPieceOrder"
        :promotion-selector-style="appSettings.promotionSelectorStyle"
        :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
        :king-piece-type="appSettings.kingPieceType"
        :board-label-type="appSettings.boardLabelType"
        :max-size="boardMaxSize"
        :position="position"
        :last-move="lastMove"
        :flip="flip"
        :mobile="true"
        :hide-clock="true"
        :drop-shadows="false"
        :allow-move="!recitation?.isComplete && !!recitation?.isUserTurn"
        :ghost-teleport-target="ghostTeleportTarget"
        :black-player-name="t.sente"
        :white-player-name="t.gote"
        @move="onMove"
      />
    </div>
    <div class="controls">
      <button class="control-button" :disabled="!canGoBack" @click="goBack">
        <Icon :icon="IconType.BACK" />
      </button>
      <button class="control-button wide" :disabled="recitation?.isComplete" @click="showHint">
        {{ t.hint }}
      </button>
      <button class="control-button wide" :disabled="recitation?.isComplete" @click="restart">
        {{ t.restartRecitation }}
      </button>
      <button class="control-button" @click="doFlip">
        <Icon :icon="IconType.FLIP" />
      </button>
    </div>
    <div class="side-selector">
      <HorizontalSelector
        :value="recitation?.side ?? 'both'"
        :items="sideItems"
        :height="26"
        @update:value="(value: string) => onChangeSide(value as RecitationSide)"
      />
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry.js";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { BoardLayoutType } from "@/common/settings/layout";
import { fileURLToCustomSchemeURL } from "@/common/url";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import { showModalDialog } from "@/renderer/helpers/dialog";
import { installHotKeyForDialog, uninstallHotKeyForDialog } from "@/renderer/devices/hotkey";
import { isIOS } from "@/renderer/helpers/env";
import { RecitationSide } from "@/common/recitation/recitation.js";
import { useRecitationController } from "./recitation_controller";

const headerHeight = 32;
const controlsHeight = 40;
const sideSelectorHeight = 30;

// iOS の多くのバージョンでは safe-area-inset-bottom が 21px になる。
// それ以外の環境もマージンを持たせる。(MobileLayout と同じ値)
const safeAreaMarginY = isIOS() ? 21 : 10;

const appSettings = useAppSettings();
const dialog = ref<HTMLDialogElement>();
const windowSize = reactive(new RectSize(window.innerWidth, window.innerHeight));

const {
  recitation,
  position,
  lastMove,
  turnText,
  elapsedText,
  sideItems,
  canGoBack,
  flip,
  doFlip,
  onMove,
  showHint,
  goBack,
  onChangeSide,
  restart,
  requestClose,
} = useRecitationController();

// ドラッグ中の駒ゴーストをダイアログ (トップレイヤー) 内に描画し、
// ダイアログより手前に表示されるようにする。
const ghostTeleportTarget = computed(() => dialog.value ?? "body");

const updateSize = () => {
  windowSize.width = window.innerWidth;
  windowSize.height = window.innerHeight;
};

const boardMaxSize = computed(
  () =>
    new RectSize(
      windowSize.width,
      windowSize.height - safeAreaMarginY - headerHeight - controlsHeight - sideSelectorHeight,
    ),
);

// 盤面の領域が縦長なら縦型レイアウト、横長ならコンパクトレイアウトを使用する。
const layoutType = computed(() =>
  boardMaxSize.value.height >= boardMaxSize.value.width
    ? BoardLayoutType.PORTRAIT
    : BoardLayoutType.COMPACT,
);

onMounted(() => {
  showModalDialog(dialog.value!, () => requestClose());
  installHotKeyForDialog(dialog.value!);
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  uninstallHotKeyForDialog(dialog.value!);
  window.removeEventListener("resize", updateSize);
});
</script>

<style scoped>
dialog.mobile-recitation {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  margin: 0;
  padding: 0;
  border: none;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  color: var(--main-color);
  background-color: var(--main-bg-color);
}
.header {
  height: 32px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.close-button {
  height: 28px;
  margin: 0;
  padding: 0 8px;
}
.close-button .icon {
  height: 100%;
  width: auto;
}
.board-view {
  display: flex;
  justify-content: center;
}
.controls {
  height: 40px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.control-button {
  height: 32px;
  margin: 0;
  padding: 0 10px;
  white-space: nowrap;
}
.control-button .icon {
  height: 100%;
  width: auto;
}
.control-button.wide {
  font-size: 90%;
}
.side-selector {
  height: 30px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}
</style>
