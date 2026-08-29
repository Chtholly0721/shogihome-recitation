import { ImmutablePosition, Move, Record } from "tsshogi";
import { RecitationState } from "@/common/recitation/recitation.js";

function createRecord(usi: string): Record {
  const record = Record.newByUSI(usi);
  if (record instanceof Error) {
    throw record;
  }
  return record;
}

function createMove(position: ImmutablePosition, usi: string): Move {
  const move = position.createMoveByUSI(usi);
  if (!move) {
    throw new Error(`failed to create move: ${usi}`);
  }
  return move;
}

describe("common/recitation", () => {
  it("constructor/resetToInitialPosition", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    record.goto(4);
    const state = new RecitationState(record);
    expect(state.totalPly).toBe(4);
    expect(state.currentPly).toBe(0);
    expect(state.mistakeCount).toBe(0);
    expect(state.isComplete).toBe(false);
    expect(record.current.ply).toBe(0);
  });

  it("constructor/emptyRecord", () => {
    expect(() => new RecitationState(new Record())).toThrow();
  });

  it("answer/correct", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record);
    expect(state.expectedMove?.usi).toBe("7g7f");
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    expect(state.currentPly).toBe(1);
    expect(state.remainingPly).toBe(3);
    expect(record.current.ply).toBe(1);
  });

  it("answer/wrong", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record);
    const movesBefore = record.moves.length;
    const positionBefore = record.position.sfen;
    expect(state.answer(createMove(record.position, "2g2f"))).toBe("wrong");
    expect(state.currentPly).toBe(0);
    expect(state.mistakeCount).toBe(1);
    // 誤った手は棋譜に反映されない。
    expect(record.current.ply).toBe(0);
    expect(record.position.sfen).toBe(positionBefore);
    expect(record.moves.length).toBe(movesBefore);
  });

  it("answer/retryAfterWrong", () => {
    const record = createRecord("startpos moves 7g7f 3c3d");
    const state = new RecitationState(record);
    expect(state.answer(createMove(record.position, "2g2f"))).toBe("wrong");
    expect(state.answer(createMove(record.position, "3g3f"))).toBe("wrong");
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    expect(state.currentPly).toBe(1);
    expect(state.mistakeCount).toBe(2);
    expect(state.answer(createMove(record.position, "3c3d"))).toBe("correct");
    expect(state.currentPly).toBe(2);
    expect(state.isComplete).toBe(true);
  });

  it("answer/afterComplete", () => {
    const record = createRecord("startpos moves 7g7f 3c3d");
    const state = new RecitationState(record);
    state.answer(createMove(record.position, "7g7f"));
    state.answer(createMove(record.position, "3c3d"));
    expect(state.isComplete).toBe(true);
    expect(state.expectedMove).toBeUndefined();
    expect(state.answer(createMove(record.position, "2g2f"))).toBeUndefined();
  });

  it("complete/withResign", () => {
    const record = createRecord("startpos moves 7g7f 3c3d resign");
    const state = new RecitationState(record);
    expect(state.totalPly).toBe(2);
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    expect(state.isComplete).toBe(false);
    expect(state.answer(createMove(record.position, "3c3d"))).toBe("correct");
    // 投了などの特殊な手は背譜の対象外で、指し手を全て再現できれば完了とする。
    expect(state.isComplete).toBe(true);
    expect(state.currentPly).toBe(2);
  });

  it("branch/followsActiveBranch", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    // 2手目に変化手（8c8d）を追加する。追加した変化手がアクティブになる。
    record.goto(1);
    record.append(createMove(record.position, "8c8d"));
    // メイン画面で選択中のアクティブな経路（7g7f → 8c8d）を背譜する。
    const state = new RecitationState(record);
    expect(state.totalPly).toBe(2);
    expect(state.expectedMove?.usi).toBe("7g7f");
    // 本譜にない手は不正解として扱われる。
    expect(state.answer(createMove(record.position, "3g3f"))).toBe("wrong");
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    expect(state.expectedMove?.usi).toBe("8c8d");
    expect(state.answer(createMove(record.position, "8c8d"))).toBe("correct");
    expect(state.isComplete).toBe(true);
  });

  it("branch/mainLineWhenSelected", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    // 2手目に変化手（8c8d）を追加する。
    record.goto(1);
    record.append(createMove(record.position, "8c8d"));
    // 本譜側（3c3d）を選択し直すと、本譜の経路を背譜する。
    record.goto(2);
    record.switchBranchByIndex(0);
    const state = new RecitationState(record);
    expect(state.totalPly).toBe(4);
    expect(state.expectedMove?.usi).toBe("7g7f");
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    expect(state.expectedMove?.usi).toBe("3c3d");
    expect(state.answer(createMove(record.position, "3c3d"))).toBe("correct");
    expect(state.answer(createMove(record.position, "2g2f"))).toBe("correct");
    expect(state.answer(createMove(record.position, "8c8d"))).toBe("correct");
    expect(state.isComplete).toBe(true);
    // 誤った手が棋譜に反映されず、構造も変わらない。
    expect(record.length).toBe(4);
  });

  it("hint/autoPlaysCorrectMove", () => {
    const record = createRecord("startpos moves 7g7f 3c3d");
    const state = new RecitationState(record);
    state.hint();
    // ヒントは正解の手を自動で指す。誤り回数として 1 回分カウントされる。
    expect(state.mistakeCount).toBe(1);
    expect(state.currentPly).toBe(1);
    expect(record.current.ply).toBe(1);
    expect(state.expectedMove?.usi).toBe("3c3d");
  });

  it("hint/sideModeDelayedOpponentMove", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record, { side: "black" });
    state.hint(); // 正解（7g7f）を自動で指す
    expect(state.currentPly).toBe(1);
    // 相手の手は自動では進まない（UI 層で遅延して advanceToUserTurn() を呼び出す）。
    expect(record.current.ply).toBe(1);
    expect(state.isUserTurn).toBe(false);
    state.advanceToUserTurn();
    expect(record.current.ply).toBe(2);
    expect(state.isUserTurn).toBe(true);
    expect(state.expectedMove?.usi).toBe("2g2f");
  });

  it("goBack/bothSides", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record);
    expect(state.goBack()).toBe(false); // まだ進んでいない
    state.answer(createMove(record.position, "7g7f"));
    state.answer(createMove(record.position, "3c3d"));
    expect(state.currentPly).toBe(2);
    expect(state.goBack()).toBe(true);
    expect(state.currentPly).toBe(1);
    expect(record.current.ply).toBe(1);
    expect(state.expectedMove?.usi).toBe("3c3d");
    // 戻った後も再び進める。
    expect(state.answer(createMove(record.position, "3c3d"))).toBe("correct");
    expect(state.currentPly).toBe(2);
  });

  it("goBack/sideMode", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record, { side: "black" });
    state.answer(createMove(record.position, "7g7f"));
    state.advanceToUserTurn(); // 後手の 3c3d を自動で進める
    expect(state.currentPly).toBe(1);
    expect(record.current.ply).toBe(2);
    expect(state.goBack()).toBe(true);
    // 直前の手番（先手）の局面に戻る。
    expect(state.currentPly).toBe(0);
    expect(record.current.ply).toBe(0);
    expect(state.expectedMove?.usi).toBe("7g7f");
    // 戻った後も再び進める。
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    state.advanceToUserTurn();
    expect(state.currentPly).toBe(1);
    expect(record.current.ply).toBe(2);
  });

  it("goBack/afterHint", () => {
    const record = createRecord("startpos moves 7g7f 3c3d");
    const state = new RecitationState(record);
    state.hint();
    expect(state.currentPly).toBe(1);
    expect(state.goBack()).toBe(true);
    expect(state.currentPly).toBe(0);
    expect(record.current.ply).toBe(0);
    // 誤り回数は維持される。
    expect(state.mistakeCount).toBe(1);
  });

  it("restart", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f");
    const state = new RecitationState(record);
    state.answer(createMove(record.position, "2g2f")); // wrong
    state.answer(createMove(record.position, "7g7f")); // correct
    state.restart();
    expect(state.currentPly).toBe(0);
    expect(state.mistakeCount).toBe(0);
    expect(record.current.ply).toBe(0);
    expect(state.expectedMove?.usi).toBe("7g7f");
  });

  it("finish", () => {
    const record = createRecord("startpos moves 7g7f 3c3d");
    const state = new RecitationState(record);
    state.answer(createMove(record.position, "7g7f"));
    state.answer(createMove(record.position, "3c3d"));
    const result = state.finish();
    expect(result.totalPly).toBe(2);
    expect(result.mistakeCount).toBe(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("dispose/restoreSavedNode", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    // 2手目に変化手を追加する。
    record.goto(1);
    record.append(createMove(record.position, "8c8d"));
    // 変化手のノードへ移動した状態を背譜開始前の状態とする。
    record.goto(2);
    record.switchBranchByIndex(1);
    const savedNode = record.current;
    const state = new RecitationState(record);
    state.answer(createMove(record.position, "7g7f"));
    state.answer(createMove(record.position, "8c8d"));
    expect(state.isComplete).toBe(true);
    state.dispose();
    expect(record.current).toBe(savedNode);
  });

  it("nonStandardInitialPosition", () => {
    // 平手以外（香落ち・白先手）の初期局面から始まる棋譜。
    const record = Record.newByUSI(
      "position sfen lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 3c3d",
    );
    if (record instanceof Error) {
      throw record;
    }
    const initialSfen = record.initialPosition.sfen;
    const state = new RecitationState(record);
    expect(record.current.ply).toBe(0);
    expect(record.position.sfen).toBe(initialSfen);
    expect(state.totalPly).toBe(1);
    expect(state.answer(createMove(record.position, "3c3d"))).toBe("correct");
    expect(state.isComplete).toBe(true);
  });

  it("side/blackOnly", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record, { side: "black" });
    // 先手の手のみを背譜の対象とする。
    expect(state.side).toBe("black");
    expect(state.totalPly).toBe(2);
    expect(state.currentPly).toBe(0);
    expect(state.isUserTurn).toBe(true);
    expect(state.expectedMove?.usi).toBe("7g7f");
    // 先手の手を指した後、後手の手を自動で進める（UI 層では遅延して呼び出される）。
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    expect(state.currentPly).toBe(1);
    expect(record.current.ply).toBe(1);
    expect(state.isUserTurn).toBe(false);
    state.advanceToUserTurn();
    expect(record.current.ply).toBe(2);
    expect(state.isUserTurn).toBe(true);
    expect(state.expectedMove?.usi).toBe("2g2f");
    expect(state.answer(createMove(record.position, "2g2f"))).toBe("correct");
    state.advanceToUserTurn();
    expect(state.currentPly).toBe(2);
    expect(record.current.ply).toBe(4);
    expect(state.isComplete).toBe(true);
  });

  it("side/whiteOnly", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record, { side: "white" });
    // 初期局面は先手番のため、先手の手が自動で進んだ状態から始まる。
    expect(state.side).toBe("white");
    expect(state.totalPly).toBe(2);
    expect(state.currentPly).toBe(0);
    expect(record.current.ply).toBe(1);
    expect(state.isUserTurn).toBe(true);
    expect(state.expectedMove?.usi).toBe("3c3d");
    expect(state.answer(createMove(record.position, "3c3d"))).toBe("correct");
    expect(state.currentPly).toBe(1);
    expect(record.current.ply).toBe(2);
    state.advanceToUserTurn();
    expect(record.current.ply).toBe(3);
    expect(state.answer(createMove(record.position, "8c8d"))).toBe("correct");
    state.advanceToUserTurn();
    expect(state.currentPly).toBe(2);
    expect(record.current.ply).toBe(4);
    expect(state.isComplete).toBe(true);
  });

  it("side/wrongMoveCountsOnlyUserMoves", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record, { side: "black" });
    expect(state.answer(createMove(record.position, "3g3f"))).toBe("wrong");
    expect(state.answer(createMove(record.position, "7g7f"))).toBe("correct");
    expect(state.mistakeCount).toBe(1);
    expect(state.currentPly).toBe(1);
  });

  it("side/restart", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record, { side: "black" });
    state.answer(createMove(record.position, "7g7f"));
    state.advanceToUserTurn();
    expect(record.current.ply).toBe(2);
    state.restart();
    expect(state.currentPly).toBe(0);
    expect(state.mistakeCount).toBe(0);
    expect(record.current.ply).toBe(0);
    expect(state.isUserTurn).toBe(true);
    expect(state.expectedMove?.usi).toBe("7g7f");
  });

  it("side/whiteWithHandicap", () => {
    // 香落ち（白先手）で後手を背譜する場合、初期局面がすでに自分の手番なので自動進行はない。
    const record = Record.newByUSI(
      "position sfen lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1 moves 3c3d 7g7f",
    );
    if (record instanceof Error) {
      throw record;
    }
    const state = new RecitationState(record, { side: "white" });
    expect(state.totalPly).toBe(1);
    expect(state.currentPly).toBe(0);
    expect(record.current.ply).toBe(0);
    expect(state.expectedMove?.usi).toBe("3c3d");
    expect(state.answer(createMove(record.position, "3c3d"))).toBe("correct");
    state.advanceToUserTurn(); // 先手の 7g7f を自動で進める
    expect(state.isComplete).toBe(true);
  });

  it("side/setSide", () => {
    const record = createRecord("startpos moves 7g7f 3c3d 2g2f 8c8d");
    const state = new RecitationState(record); // 既定は both
    expect(state.side).toBe("both");
    expect(state.totalPly).toBe(4);
    state.answer(createMove(record.position, "7g7f"));
    state.answer(createMove(record.position, "3c3d"));
    expect(state.currentPly).toBe(2);
    // 手番を先手のみに変更すると最初からやり直す。
    expect(state.setSide("black")).toBe(true);
    expect(state.side).toBe("black");
    expect(state.totalPly).toBe(2);
    expect(state.currentPly).toBe(0);
    expect(state.mistakeCount).toBe(0);
    expect(record.current.ply).toBe(0);
    expect(state.expectedMove?.usi).toBe("7g7f");
  });
});
