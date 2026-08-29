import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Color, Move, Position } from "tsshogi";
import { t } from "@/common/i18n";
import { secondsToMMSS } from "@/common/helpers/time.js";
import { RecitationSide } from "@/common/recitation/recitation.js";
import { useStore } from "@/renderer/store";
import { useConfirmationStore } from "@/renderer/store/confirm";
import { useMessageStore } from "@/renderer/store/message";

export type RecitationSideItem = {
  value: RecitationSide;
  label: string;
};

export const recitationSideItems: RecitationSideItem[] = [
  { value: "both", label: t.recitationBoth },
  { value: "black", label: t.recitationBlack },
  { value: "white", label: t.recitationWhite },
];

/** 正解メッセージを自動で閉じるまでの時間（ミリ秒） */
const CORRECT_MESSAGE_DURATION_MS = 300;
/** 不正解メッセージを自動で閉じるまでの時間（ミリ秒） */
const WRONG_MESSAGE_DURATION_MS = 500;
/** 手番モードで相手の手を自動で進めるまでの遅延（ミリ秒） */
const OPPONENT_MOVE_DELAY_MS = 400;

/**
 * 背譜モードのダイアログ共通ロジック（デスクトップ版・モバイル版で共有）。
 * setup() 内で呼び出すこと。
 */
export function useRecitationController() {
  const store = useStore();
  const recitation = computed(() => store.recitation);
  const flip = ref(false);
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;
  let opponentMoveTimer: ReturnType<typeof setTimeout> | undefined;

  const position = computed(
    () => (recitation.value?.record.position as Position) || new Position(),
  );
  // 最後に指された手（相手の手が自動で進んだ場合も含む）を強調表示する。
  const lastMove = computed(() => {
    const move = recitation.value?.record.current.move;
    return move instanceof Move ? move : undefined;
  });
  const turnText = computed(() => (position.value.color === Color.BLACK ? t.sente : t.gote));
  const elapsedText = computed(() => {
    const r = recitation.value;
    if (!r) {
      return "";
    }
    // now への参照で 1 秒ごとの再評価を促す。
    void now.value;
    return secondsToMMSS(Math.max(0, Math.floor(r.elapsedMs / 1000)));
  });

  const canGoBack = computed(() => (recitation.value?.currentPly ?? 0) > 0);

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  });

  onBeforeUnmount(() => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    if (opponentMoveTimer) {
      clearTimeout(opponentMoveTimer);
      opponentMoveTimer = undefined;
    }
  });

  // 背譜が完了したら成績を表示する。
  watch(
    () => recitation.value?.isComplete,
    (complete) => {
      if (!complete) {
        return;
      }
      const r = recitation.value;
      if (!r) {
        return;
      }
      const result = r.finish();
      const elapsed = secondsToMMSS(Math.max(0, Math.floor(result.elapsedMs / 1000)));
      useConfirmationStore().show({
        message: `${t.recitationCompleted}\n${t.recitationResult(result.totalPly, result.mistakeCount, elapsed)}`,
        buttonType: "okCancel",
        onOk: () => store.stopRecitation(),
        onCancel: () => store.stopRecitation(),
      });
    },
  );

  /** 手番モードで相手の手を少し待ってから自動で進め、対局しているような感覚にする。 */
  const scheduleOpponentMove = (r: {
    isComplete: boolean;
    isUserTurn: boolean;
    advanceToUserTurn(): void;
  }) => {
    if (r.isComplete || r.isUserTurn) {
      return;
    }
    if (opponentMoveTimer) {
      clearTimeout(opponentMoveTimer);
    }
    opponentMoveTimer = setTimeout(() => {
      r.advanceToUserTurn();
      opponentMoveTimer = undefined;
    }, OPPONENT_MOVE_DELAY_MS);
  };

  const onMove = (move: Move) => {
    const r = recitation.value;
    const judgement = r?.answer(move);
    switch (judgement) {
      case "correct":
        // 完了時は成績ダイアログが表示されるためメッセージをスキップする。
        if (!r?.isComplete) {
          useMessageStore().enqueue({
            text: t.correct,
            duration: CORRECT_MESSAGE_DURATION_MS,
            style: "success",
          });
        }
        if (r) {
          scheduleOpponentMove(r);
        }
        break;
      case "wrong":
        useMessageStore().enqueue({
          text: `${t.incorrect} - ${t.pleaseTryAgain}`,
          duration: WRONG_MESSAGE_DURATION_MS,
          style: "error",
        });
        break;
    }
  };

  const showHint = () => {
    const r = recitation.value;
    if (!r || !r.expectedMove) {
      return;
    }
    // 正解の手を自動で指す（メッセージは表示しない）。
    r.hint();
    // 相手の手も遅延して自動で進める。
    scheduleOpponentMove(r);
  };

  const goBack = () => {
    recitation.value?.goBack();
  };

  const onChangeSide = (side: RecitationSide) => {
    const r = recitation.value;
    if (!r || r.side === side) {
      return;
    }
    if (r.currentPly === 0) {
      r.setSide(side);
      return;
    }
    useConfirmationStore().show({
      message: t.recitationSideChangeConfirm,
      buttonType: "yesNo",
      onOk: () => r.setSide(side),
    });
  };

  const restart = () => {
    if (!recitation.value) {
      return;
    }
    useConfirmationStore().show({
      message: t.doYouWantToRestartRecitation,
      buttonType: "yesNo",
      onOk: () => recitation.value?.restart(),
    });
  };

  const requestClose = () => {
    const r = recitation.value;
    if (!r || r.currentPly === 0 || r.isComplete) {
      store.stopRecitation();
      return;
    }
    useConfirmationStore().show({
      message: t.areYouSureWantToQuitRecitation,
      buttonType: "yesNo",
      onOk: () => store.stopRecitation(),
    });
  };

  const doFlip = () => {
    flip.value = !flip.value;
  };

  return {
    recitation,
    position,
    lastMove,
    turnText,
    elapsedText,
    sideItems: recitationSideItems,
    canGoBack,
    flip,
    doFlip,
    onMove,
    showHint,
    goBack,
    onChangeSide,
    restart,
    requestClose,
  };
}
