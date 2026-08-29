import { Color, ImmutableNode, Move, Record, reverseColor } from "tsshogi";

export type RecitationJudgement = "correct" | "wrong";

export type RecitationSide = "both" | "black" | "white";

export type RecitationOptions = {
  /**
   * 背譜する手番を指定します。
   * - "both": 先手・後手の両方を背譜する（既定）
   * - "black": 先手の手のみ背譜し、後手の手は棋譜どおり自動で進む
   * - "white": 後手の手のみ背譜し、先手の手は棋譜どおり自動で進む
   */
  side?: RecitationSide;
};

export type RecitationResult = {
  /** 背譜の対象とした総手数（選択した手番の指し手数） */
  totalPly: number;
  /** 誤った手数（ヒントの使用を含む） */
  mistakeCount: number;
  /** 経過時間（ミリ秒） */
  elapsedMs: number;
};

/**
 * 背譜（棋譜の暗記・再現）モードの状態管理クラス。
 *
 * 開いている棋譜の「アクティブな経路」（メイン画面で選択中の本譜・変化手順）を
 * 暗記対象とし、盤上で指された手をその経路の対応する手と比較する。正解の手は
 * 棋譜上の対応ノードへ移動するだけで棋譜構造（ノード・分岐・コメント等）は
 * 一切変更しない。誤った手は棋譜に反映せず、局面を保持したまま再挑戦できる。
 *
 * 手番モード（side）が "black" / "white" の場合は、その手番の手のみを背譜の
 * 対象とし、相手の手は棋譜どおり自動で進む。
 *
 * このクラスは Vue に依存しない純粋なロジックであり、単体テストの対象とする。
 */
export class RecitationState {
  private _record: Record;
  private _savedNode: ImmutableNode;
  private _side: RecitationSide;
  private _userColor?: Color;
  private _totalPly: number;
  private _progress = 0;
  private _mistakeCount = 0;
  private _startedAt = Date.now();
  /** 正解した手を指す前の局面の履歴（「前の一手」に戻るために使用） */
  private _history: ImmutableNode[] = [];

  /**
   * @param record 背譜対象の棋譜。アクティブな経路（メイン画面で選択中の分岐）に沿って背譜する。
   * @param options 背譜の設定（手番モードなど）。
   * @throws 背譜対象の指し手が 1 手もない場合
   */
  constructor(record: Record, options?: RecitationOptions) {
    this._record = record;
    this._side = options?.side || "both";
    this._userColor = this.sideToColor(this._side);
    this._savedNode = record.current;
    this._totalPly = this.countTargetMoves();
    if (this._totalPly === 0) {
      throw new Error("背譜対象の指し手がありません。");
    }
    // アクティブな経路（分岐選択）を保持したまま初期局面へ戻る。
    record.goto(0);
    this.advanceToUserTurn();
  }

  /** 背譜中の棋譜を返します。 */
  get record(): Record {
    return this._record;
  }

  /** 背譜開始前にいたノードを返します（終了時にこのノードへ戻る）。 */
  get savedNode(): ImmutableNode {
    return this._savedNode;
  }

  /** 背譜する手番を返します。 */
  get side(): RecitationSide {
    return this._side;
  }

  /** 正解した手数（現在の進捗。選択した手番の手のみを数える）を返します。 */
  get currentPly(): number {
    return this._progress;
  }

  /** 背譜の総手数（選択した手番の指し手数）を返します。 */
  get totalPly(): number {
    return this._totalPly;
  }

  /** 残りの手数を返します。 */
  get remainingPly(): number {
    return this._totalPly - this._progress;
  }

  /** 誤った手数（ヒントの使用を含む）を返します。 */
  get mistakeCount(): number {
    return this._mistakeCount;
  }

  /** 背譜開始からの経過時間（ミリ秒）を返します。 */
  get elapsedMs(): number {
    return Date.now() - this._startedAt;
  }

  /** 本譜を全て再現したかどうかを返します。 */
  get isComplete(): boolean {
    return this.nextMoveNode() === null;
  }

  /** 現在の局面が背譜する手番であるかどうかを返します。 */
  get isUserTurn(): boolean {
    return this._side === "both" || this._record.position.color === this._userColor;
  }

  /** 現在の局面で本譜が指した手（正解）を返します。背譜する手番でない場合や完了後は undefined を返します。 */
  get expectedMove(): Move | undefined {
    if (!this.isUserTurn) {
      return undefined;
    }
    const node = this.nextMoveNode();
    return node && node.move instanceof Move ? node.move : undefined;
  }

  /**
   * 盤上で指された手を判定します。
   * 正解の場合は棋譜上の対応ノードへ移動して 1 手進め、相手の手番の手は自動で進みます。
   * 誤りの場合は棋譜を変更せず、誤り回数を 1 増やします。
   * 背譜する手番でない場合や完了後は undefined を返します。
   */
  answer(move: Move): RecitationJudgement | undefined {
    if (this.isComplete || !this.isUserTurn) {
      return undefined;
    }
    const expectedNode = this.nextMoveNode();
    if (!expectedNode || !(expectedNode.move instanceof Move)) {
      return undefined;
    }
    if (move.usi !== expectedNode.move.usi) {
      this._mistakeCount++;
      return "wrong";
    }
    this._history.push(this._record.current);
    this._record.gotoNode(expectedNode);
    this._progress++;
    return "correct";
  }

  /**
   * 正解の手を自動で指して 1 手進めます（ヒント）。
   * 誤り回数として 1 回分カウントされ、履歴にも追加されます（「前の一手」で戻れます）。
   * 相手の手は自動では進めません（UI 層で遅延させて advanceToUserTurn() を呼び出します）。
   * 背譜する手番でない場合や完了後は何もしません。
   */
  hint(): void {
    if (this.isComplete || !this.isUserTurn) {
      return;
    }
    const expectedNode = this.nextMoveNode();
    if (!expectedNode || !(expectedNode.move instanceof Move)) {
      return;
    }
    this._mistakeCount++;
    this._history.push(this._record.current);
    this._record.gotoNode(expectedNode);
    this._progress++;
  }

  /**
   * 1 手前に戻ります（「前の一手」）。
   * 正解した手を指す前の局面（手番モードでは自分の手番の局面）に戻り、進捗を 1 減らします。
   * 誤り回数は維持されます。戻れる手がなければ false を返します。
   */
  goBack(): boolean {
    const node = this._history.pop();
    if (!node) {
      return false;
    }
    this._record.gotoNode(node);
    this._progress = Math.max(0, this._progress - 1);
    return true;
  }

  /**
   * 背譜する手番を変更します。進捗・誤り回数・計測時間はリセットされ、最初からやり直します。
   * @returns 変更に成功した場合は true を返します。新しい手番に背譜対象の手がない場合は false を返します。
   */
  setSide(side: RecitationSide): boolean {
    if (this._side === side) {
      return true;
    }
    const userColor = this.sideToColor(side);
    const count = this.countTargetMovesFor(side);
    if (count === 0) {
      return false;
    }
    this._side = side;
    this._userColor = userColor;
    this._totalPly = count;
    this.restart();
    return true;
  }

  /** 背譜を最初からやり直します。誤り回数と計測時間はリセットされます。 */
  restart(): void {
    this._record.goto(0);
    this._progress = 0;
    this._mistakeCount = 0;
    this._history = [];
    this._startedAt = Date.now();
    this.advanceToUserTurn();
  }

  /** 成績を返します。完了時に呼び出します。 */
  finish(): RecitationResult {
    return {
      totalPly: this._totalPly,
      mistakeCount: this._mistakeCount,
      elapsedMs: this.elapsedMs,
    };
  }

  /** 背譜を終了して、開始前のノードと分岐選択に復元します。 */
  dispose(): void {
    this._record.gotoNode(this._savedNode);
  }

  /** 現在のノードの次（アクティブ経路上）の指し手ノードを返します。 */
  private nextMoveNode(): ImmutableNode | null {
    return this.nextActiveMoveNodeFrom(this._record.current);
  }

  /** 指定ノードの次（アクティブ経路上）のノードを返します。 */
  private nextActiveNodeFrom(node: ImmutableNode): ImmutableNode | null {
    let next = node.next;
    while (next && !next.activeBranch) {
      next = next.branch;
    }
    return next;
  }

  /** アクティブ経路上の、次の指し手（Move）ノードを返します。特殊な指し手はスキップします。 */
  private nextActiveMoveNodeFrom(node: ImmutableNode): ImmutableNode | null {
    let next = this.nextActiveNodeFrom(node);
    while (next && !(next.move instanceof Move)) {
      next = this.nextActiveNodeFrom(next);
    }
    return next;
  }

  /**
   * 背譜する手番になるまで、相手の手を棋譜どおり自動で進めます。
   * 手番モードで相手の手を遅延させて表示したい場合は、このメソッドを
   * 呼び出し側（UI 層）でタイマーを使って呼び出します。
   */
  advanceToUserTurn(): void {
    while (!this.isComplete && !this.isUserTurn) {
      const node = this.nextMoveNode();
      if (!node) {
        break;
      }
      this._record.gotoNode(node);
    }
  }

  /** アクティブな経路の背譜対象の指し手の総数を数えます。特殊な指し手は数えません。 */
  private countTargetMoves(): number {
    return this.countTargetMovesFor(this._side);
  }

  private countTargetMovesFor(side: RecitationSide): number {
    const userColor = this.sideToColor(side);
    let count = 0;
    for (
      let node = this.nextActiveNodeFrom(this._record.first);
      node;
      node = this.nextActiveNodeFrom(node)
    ) {
      if (!(node.move instanceof Move)) {
        continue;
      }
      if (side === "both" || reverseColor(node.nextColor) === userColor) {
        count++;
      }
    }
    return count;
  }

  private sideToColor(side: RecitationSide): Color | undefined {
    switch (side) {
      case "black":
        return Color.BLACK;
      case "white":
        return Color.WHITE;
      default:
        return undefined;
    }
  }
}
