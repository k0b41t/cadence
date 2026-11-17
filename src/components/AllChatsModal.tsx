import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, MessageSquare, Search, Send, Trash2, X } from 'lucide-react';
import { deleteTaskMessage, sendTaskMessage } from '../lib/kanbanService';
import { LIMITS, type Board, type Column, type Task, type TaskMessage } from '../types/kanban';

interface AllChatsModalProps {
  uid: string;
  senderName: string;
  isAdmin: boolean;
  boards: Board[];
  activeBoard: Board | null;
  activeBoardColumns: Column[];
  activeBoardTasks: Task[];
  allMessages: TaskMessage[];
  onOpenTask: (boardId: string, taskId: string) => void;
  onClose: () => void;
}

export function AllChatsModal({
  uid,
  senderName,
  isAdmin,
  boards,
  activeBoard,
  activeBoardColumns,
  activeBoardTasks,
  allMessages,
  onOpenTask,
  onClose,
}: AllChatsModalProps) {
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [viewMode, setViewMode] = useState<'feed' | 'grouped'>('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyingTaskKey, setReplyingTaskKey] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const boardMap = useMemo(() => {
    const map = new Map<string, Board>();
    boards.forEach((b) => map.set(b.id, b));
    return map;
  }, [boards]);

  const activeTaskMap = useMemo(() => {
    const map = new Map<string, Task>();
    activeBoardTasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [activeBoardTasks]);

  const activeColMap = useMemo(() => {
    const map = new Map<string, Column>();
    activeBoardColumns.forEach((c) => map.set(c.id, c));
    return map;
  }, [activeBoardColumns]);

  const scopedMessages = useMemo(() => {
    const base =
      scope === 'current' && activeBoard
        ? allMessages.filter((m) => m.boardId === activeBoard.id)
        : allMessages;

    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? base.filter((m) => {
          const liveTitle =
            m.boardId === activeBoard?.id
              ? activeTaskMap.get(m.taskId)?.title ?? m.taskTitle
              : m.taskTitle;
          const boardTitle = boardMap.get(m.boardId)?.title ?? '';
          return (
            m.text.toLowerCase().includes(q) ||
            m.senderName.toLowerCase().includes(q) ||
            liveTitle.toLowerCase().includes(q) ||
            boardTitle.toLowerCase().includes(q)
          );
        })
      : base;

    // Show newest messages first in the unified hub
    return [...filtered].sort(
      (a, b) =>
        (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) -
        (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER)
    );
  }, [scope, activeBoard, allMessages, searchQuery, activeTaskMap, boardMap]);

  const groupedThreads = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        boardId: string;
        taskId: string;
        taskTitle: string;
        messages: TaskMessage[];
      }
    >();

    // Chronological order inside each thread
    const chronological = [...scopedMessages].reverse();
    for (const msg of chronological) {
      const key = `${msg.boardId}::${msg.taskId}`;
      const liveTitle =
        msg.boardId === activeBoard?.id
          ? activeTaskMap.get(msg.taskId)?.title ?? msg.taskTitle
          : msg.taskTitle;
      const existing = groups.get(key);
      if (existing) {
        existing.messages.push(msg);
        existing.taskTitle = liveTitle;
      } else {
        groups.set(key, {
          key,
          boardId: msg.boardId,
          taskId: msg.taskId,
          taskTitle: liveTitle,
          messages: [msg],
        });
      }
    }

    // Sort threads by most recent message descending
    return Array.from(groups.values()).sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      const bLast = b.messages[b.messages.length - 1]?.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      return bLast - aLast;
    });
  }, [scopedMessages, activeBoard, activeTaskMap]);

  const handleSendQuickReply = async (
    e: React.FormEvent,
    boardId: string,
    taskId: string,
    taskTitle: string
  ) => {
    e.preventDefault();
    const targetBoard = boardMap.get(boardId);
    const clean = replyText.trim();
    if (!targetBoard || !clean || sendingReply) return;
    if (!isAdmin && targetBoard.status === 'archived') {
      setErrorMsg('Cannot post to an archived board.');
      return;
    }

    setSendingReply(true);
    setErrorMsg(null);
    try {
      await sendTaskMessage(uid, senderName, targetBoard, { id: taskId, title: taskTitle }, clean);
      setReplyText('');
      setReplyingTaskKey(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const formatTimestamp = (msg: TaskMessage) => {
    if (!msg.createdAt) return 'Sending...';
    return msg.createdAt.toDate().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderTaskContext = (msg: TaskMessage) => {
    const board = boardMap.get(msg.boardId);
    const liveTask = msg.boardId === activeBoard?.id ? activeTaskMap.get(msg.taskId) : undefined;
    const taskTitle = liveTask?.title ?? msg.taskTitle;
    const colTitle = liveTask ? activeColMap.get(liveTask.columnId)?.title : undefined;

    return {
      board,
      taskTitle,
      colTitle,
      completed: liveTask?.completed ?? false,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-chats-heading"
        className="w-full max-w-3xl max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2
              id="all-chats-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              All Task Chats
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
              · {scopedMessages.length} {scopedMessages.length === 1 ? 'message' : 'messages'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close all chats"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-md shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter & Controls Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats by message, sender, or task..."
              aria-label="Search chats"
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear chat search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {boards.length > 1 && activeBoard && (
              <div
                role="group"
                aria-label="Chat board scope"
                className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    scope === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  All Boards
                </button>
                <button
                  type="button"
                  onClick={() => setScope('current')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    scope === 'current'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  This Board
                </button>
              </div>
            )}

            <div
              role="group"
              aria-label="Chat layout"
              className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              <button
                type="button"
                onClick={() => setViewMode('feed')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'feed'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Timeline
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grouped')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'grouped'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                By task
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5"
            >
              {errorMsg}
            </div>
          )}

          {scopedMessages.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <MessageSquare className="w-7 h-7 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {searchQuery ? 'No matching chats found' : 'No task chats yet'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Open any task card on a board to start a chat log. Every message will appear here tagged with its task.
              </p>
            </div>
          ) : viewMode === 'feed' ? (
            <div className="space-y-3">
              {scopedMessages.map((msg) => {
                const ctx = renderTaskContext(msg);
                const threadKey = `${msg.boardId}::${msg.taskId}`;
                const isReplying = replyingTaskKey === threadKey;
                const isMine = msg.senderId === uid;
                const canDeleteMsg =
                  ctx.board &&
                  (isAdmin || ctx.board.status === 'active') &&
                  (isAdmin || ctx.board.ownerId === uid || isMine);
                const canReply = ctx.board && (isAdmin || ctx.board.status === 'active');

                return (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 p-4 space-y-2.5"
                  >
                    {/* Task Tag Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenTask(msg.boardId, msg.taskId)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100/80 dark:hover:bg-blue-950/70 border border-blue-200/80 dark:border-blue-900/70 rounded-md transition-colors min-w-0 max-w-full"
                      >
                        <span className="text-blue-500 dark:text-blue-400 shrink-0">Task:</span>
                        <span className={`truncate ${ctx.completed ? 'line-through opacity-75' : ''}`}>
                          {ctx.taskTitle}
                        </span>
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        {canReply && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isReplying) {
                                setReplyingTaskKey(null);
                                setReplyText('');
                              } else {
                                setReplyingTaskKey(threadKey);
                                setReplyText('');
                              }
                            }}
                            className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap"
                          >
                            {isReplying ? 'Cancel' : 'Reply'}
                          </button>
                        )}
                        {canDeleteMsg && (
                          <button
                            type="button"
                            aria-label="Delete message"
                            onClick={() => deleteTaskMessage(msg.boardId, msg.id)}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Message Body */}
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>

                    {/* Unboxed Metadata Line */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {isMine ? `${msg.senderName} (You)` : msg.senderName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px]">{formatTimestamp(msg)}</span>
                      {ctx.board && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[180px]">{ctx.board.title}</span>
                        </>
                      )}
                      {ctx.colTitle && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{ctx.colTitle}</span>
                        </>
                      )}
                    </div>

                    {/* Inline Quick Reply */}
                    {isReplying && (
                      <form
                        onSubmit={(e) => handleSendQuickReply(e, msg.boardId, msg.taskId, ctx.taskTitle)}
                        className="pt-2 flex items-center gap-2"
                      >
                        <input
                          type="text"
                          autoFocus
                          maxLength={LIMITS.MESSAGE_TEXT_MAX}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder={`Reply to "${ctx.taskTitle}"...`}
                          className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          type="submit"
                          disabled={sendingReply || !replyText.trim()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                        >
                          <Send className="w-3 h-3" />
                          <span>Send</span>
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedThreads.map((thread) => {
                const board = boardMap.get(thread.boardId);
                const liveTask =
                  thread.boardId === activeBoard?.id ? activeTaskMap.get(thread.taskId) : undefined;
                const colTitle = liveTask ? activeColMap.get(liveTask.columnId)?.title : undefined;
                const isReplying = replyingTaskKey === thread.key;
                const canReply = board && (isAdmin || board.status === 'active');

                return (
                  <div
                    key={thread.key}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenTask(thread.boardId, thread.taskId)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline min-w-0"
                        >
                          <span className="truncate">{thread.taskTitle}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                        </button>
                        {board && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                            · {board.title}
                            {colTitle ? ` / ${colTitle}` : ''}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {thread.messages.length}
                        </span>
                        {canReply && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isReplying) {
                                setReplyingTaskKey(null);
                                setReplyText('');
                              } else {
                                setReplyingTaskKey(thread.key);
                                setReplyText('');
                              }
                            }}
                            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                          >
                            {isReplying ? 'Cancel' : 'Reply'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-2.5">
                      {thread.messages.map((msg) => {
                        const isMine = msg.senderId === uid;
                        return (
                          <div key={msg.id} className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {isMine ? `${msg.senderName} (You)` : msg.senderName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[11px] tabular-nums">
                                {formatTimestamp(msg)}
                              </span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                              {msg.text}
                            </p>
                          </div>
                        );
                      })}

                      {isReplying && (
                        <form
                          onSubmit={(e) =>
                            handleSendQuickReply(e, thread.boardId, thread.taskId, thread.taskTitle)
                          }
                          className="pt-2 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800"
                        >
                          <input
                            type="text"
                            autoFocus
                            maxLength={LIMITS.MESSAGE_TEXT_MAX}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={`Reply to "${thread.taskTitle}"...`}
                            className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <button
                            type="submit"
                            disabled={sendingReply || !replyText.trim()}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                          >
                            <Send className="w-3 h-3" />
                            <span>Send</span>
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
