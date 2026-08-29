<template>
  <DialogFrame ref="dialogFrame" @cancel="requestClose">
    <div class="header">
      <span class="header-item">{{
        t.plyNofM(recitation?.currentPly ?? 0, recitation?.totalPly ?? 0)
      }}</span>
      <span class="header-item">{{ turnText }}</span>
      <span class="header-item">{{ t.mistakeCount }}: {{ recitation?.mistakeCount ?? 0 }}</span>
      <span class="header-item">{{ t.elapsedTime }}: {{ elapsedText }}</span>
      <HorizontalSelector
        class="header-item"
        :value="recitation?.side ?? 'both'"
        :items="sideItems"
        @update:value="(value: string) => onChangeSide(value as RecitationSide)"
      />
    </div>
    <div class="board-view">
      <div class="board-frame" @mousedown.stop>
        <BoardView
          :board-image-type="appSettings.boardImage"
          :custom-board-image-url="
            appSettings.boardImageFileURL && fileURLToCustomSchemeURL(appSettings.boardImageFileURL)
          "
          :board-grid-color="appSettings.boardGridColor || undefined"
          :piece-stand-image-type="appSettings.pieceStandImage"
          :custom-piece-stand-image-url="
            appSettings.pieceStandImageFileURL &&
            fileURLToCustomSchemeURL(appSettings.pieceStandImageFileURL)
          "
          :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
          :king-piece-type="appSettings.kingPieceType"
          :board-label-type="appSettings.boardLabelType"
          :max-size="maxSize"
          :position="position"
          :last-move="lastMove"
          :flip="flip"
          :allow-move="!recitation?.isComplete && !!recitation?.isUserTurn"
          :ghost-teleport-target="ghostTeleportTarget"
          :black-player-name="t.sente"
          :white-player-name="t.gote"
          @move="onMove"
        >
          <template #right-control>
            <div class="full column">
              <div class="row control-row">
                <button class="control-item" data-hotkey="Mod+t" @click="doFlip">
                  <Icon :icon="IconType.FLIP" />
                </button>
                <button class="control-item" data-hotkey="Escape" @click="requestClose">
                  <Icon :icon="IconType.CLOSE" />
                </button>
              </div>
            </div>
          </template>
          <template #left-control>
            <div class="full column reverse">
              <button class="control-item-wide" :disabled="!canGoBack" @click="goBack">
                {{ t.previousMove }}
              </button>
              <button
                class="control-item-wide"
                :disabled="recitation?.isComplete"
                @click="showHint"
              >
                {{ t.hint }}
              </button>
              <button class="control-item-wide" :disabled="recitation?.isComplete" @click="restart">
                {{ t.restartRecitation }}
              </button>
            </div>
          </template>
        </BoardView>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { t } from "@/common/i18n";
import { RectSize } from "@/common/assets/geometry.js";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { fileURLToCustomSchemeURL } from "@/common/url";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import DialogFrame from "./DialogFrame.vue";
import { RecitationSide } from "@/common/recitation/recitation.js";
import { useRecitationController } from "./recitation_controller";

const appSettings = useAppSettings();
const dialogFrame = ref<InstanceType<typeof DialogFrame>>();
const maxSize = reactive(new RectSize(0, 0));

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
const ghostTeleportTarget = computed(() => dialogFrame.value?.dialog ?? "body");

const updateSize = () => {
  maxSize.width = window.innerWidth * 0.8;
  maxSize.height = window.innerHeight * 0.8 - 80;
};

onMounted(() => {
  updateSize();
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSize);
});
</script>

<style scoped>
.header {
  margin-bottom: 5px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}
.header-item {
  margin: 0 10px;
}
.board-view {
  display: flex;
  justify-content: center;
}
/* ドラッグ無効化 (mousedown.stop) を盤の領域に限定し、
   盤の左右の余白ではダイアログをドラッグできるようにする。 */
.board-frame {
  width: fit-content;
}
.control-row {
  width: 100%;
  height: 25%;
  margin: 0px;
}
.control-item {
  width: 50%;
  height: 100%;
  margin: 0px;
  font-size: 100%;
  padding: 0 5% 0 5%;
}
.control-item .icon {
  height: 80%;
  width: auto;
}
.control-item-wide {
  width: 100%;
  height: 19%;
  margin: 0px;
  font-size: 90%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  line-height: 200%;
  padding: 0 5% 0 5%;
}
.control-item-wide:not(:last-child) {
  margin-top: 1%;
}
</style>
