import { useState, useEffect, useCallback, useRef } from 'react';
import { supportChatAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import '../../styles/SupportChatPage.css';

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState('success');
  const t = useRef(null);
  const show = useCallback((message, tp = 'success') => {
    clearTimeout(t.current);
    setMsg(message); setType(tp);
    t.current = setTimeout(() => setMsg(''), 3000);
  }, []);
  return { msg, type, show };
}

// ─── Time helpers ─────────────────────────────────────────────────────────────
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function relativeTime(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(iso);
}

// ─── Status badge for chat thread ─────────────────────────────────────────────
function ThreadStatusBadge({ status }) {
  return status === 'locked'
    ? <span className="sc-thread-badge sc-thread-badge--locked">Locked</span>
    : <span className="sc-thread-badge sc-thread-badge--open">Active</span>;
}

// ─── Avatar — initials-based ──────────────────────────────────────────────────
function Avatar({ name, size = 'md' }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  return (
    <div className={`sc-avatar sc-avatar--${size}`} aria-hidden="true">
      {initials}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message, isStaff }) {
  return (
    <div className={`sc-bubble-wrap${isStaff ? ' sc-bubble-wrap--staff' : ''}`}>
      {!isStaff && (
        <Avatar name={message.sender_name} size="sm" />
      )}
      <div className={`sc-bubble${isStaff ? ' sc-bubble--staff' : ' sc-bubble--customer'}`}>
        {message.related_order_number && (
          <span className="sc-bubble__order-tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            </svg>
            {message.related_order_number}
          </span>
        )}
        <p className="sc-bubble__text">{message.message_text}</p>
        <span className="sc-bubble__time">{formatTime(message.sent_at)}</span>
      </div>
      {isStaff && (
        <Avatar name={message.sender_name} size="sm" />
      )}
    </div>
  );
}

// ─── Date divider ─────────────────────────────────────────────────────────────
function DateDivider({ label }) {
  return (
    <div className="sc-date-divider" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

// ─── Thread list item ─────────────────────────────────────────────────────────
function ThreadItem({ thread, isActive, onClick, unread }) {
  return (
    <button
      className={`sc-thread${isActive ? ' sc-thread--active' : ''}${unread ? ' sc-thread--unread' : ''}`}
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`Chat with ${thread.customer_name}${unread ? ', unread messages' : ''}`}
    >
      <div className="sc-thread__avatar-wrap">
        <Avatar name={thread.customer_name} />
        {unread && <span className="sc-thread__unread-dot" aria-hidden="true" />}
      </div>

      <div className="sc-thread__content">
        <div className="sc-thread__top">
          <span className="sc-thread__name">{thread.customer_name}</span>
          <span className="sc-thread__time">{relativeTime(thread.last_message_at)}</span>
        </div>
        <p className="sc-thread__preview">
          {thread.last_message_text || 'No messages yet'}
        </p>
        <div className="sc-thread__meta">
          <ThreadStatusBadge status={thread.status} />
          {thread.active_order_number && (
            <span className="sc-thread__order">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              </svg>
              {thread.active_order_number}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Empty chat panel ─────────────────────────────────────────────────────────
function NoChatSelected() {
  return (
    <div className="sc-no-chat">
      <div className="sc-no-chat__icon" aria-hidden="true">
        {/* Ink-brush chat SVG */}
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <line x1="9" y1="10" x2="15" y2="10"/>
          <line x1="9" y1="14" x2="13" y2="14"/>
        </svg>
      </div>
      <h3 className="sc-no-chat__title">Select a conversation</h3>
      <p className="sc-no-chat__sub">Choose a thread from the left to start replying</p>
    </div>
  );
}

// ─── Order Drawer ─────────────────────────────────────────────────────────────
function OrderDrawer({ order, onClose }) {
  const DELIVERY_FEE = 50;
  const subtotal = order.items?.reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0) || 0;
  const total = subtotal + DELIVERY_FEE;

  const statusMap = {
    confirmed:        { label: 'Confirmed',         cls: 'od-status--confirmed' },
    preparing:        { label: 'Preparing',          cls: 'od-status--preparing' },
    ready:            { label: 'Ready',              cls: 'od-status--ready' },
    assigned:         { label: 'Rider assigned',     cls: 'od-status--assigned' },
    out_for_delivery: { label: 'Out for delivery',   cls: 'od-status--out' },
    delivered:        { label: 'Delivered',          cls: 'od-status--done' },
    cancelled:        { label: 'Cancelled',          cls: 'od-status--cancelled' },
  };

  const { label: statusLabel, cls: statusCls } = statusMap[order.status] || { label: order.status, cls: '' };

  return (
    <aside className="od-drawer" aria-label={`Order details for ${order.order_number}`}>
      {/* Header */}
      <div className="od-header">
        <div>
          <p className="od-header__num">{order.order_number}</p>
          <span className={`od-status ${statusCls}`}>{statusLabel}</span>
        </div>
        <button className="od-close" onClick={onClose} aria-label="Close order details">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="od-body">
        {/* Items */}
        <div className="od-section">
          <p className="od-section__label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Order Items
          </p>

          {order.items?.length > 0 ? (
            <div className="od-items">
              {order.items.map((item, i) => (
                <div key={i} className="od-item">
                  <div className="od-item__left">
                    <span className="od-item__qty">{item.quantity}×</span>
                    <span className="od-item__name">{item.name}</span>
                  </div>
                  {item.price != null && (
                    <span className="od-item__price">
                      ₱{(item.price * item.quantity).toFixed(0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="od-empty">No item details available.</p>
          )}
        </div>

        {/* Breakdown — only if prices are available */}
        {subtotal > 0 && (
          <div className="od-section">
            <p className="od-section__label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              Price Breakdown
            </p>
            <div className="od-breakdown">
              <div className="od-breakdown__row">
                <span>Subtotal</span>
                <span>₱{subtotal.toFixed(0)}</span>
              </div>
              <div className="od-breakdown__row">
                <span>Delivery fee</span>
                <span>₱{DELIVERY_FEE.toFixed(0)}</span>
              </div>
              <div className="od-breakdown__divider" aria-hidden="true" />
              <div className="od-breakdown__row od-breakdown__row--total">
                <span>Total</span>
                <span>₱{total.toFixed(0)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SupportChatPage() {
  const [threads,        setThreads]        = useState([]);
  const [activeThread,   setActiveThread]   = useState(null);
  const [messages,       setMessages]       = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading,setMessagesLoading]= useState(false);
  const [error,          setError]          = useState('');
  const [replyText,      setReplyText]      = useState('');
  const [sending,        setSending]        = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [unreadIds,      setUnreadIds]      = useState(new Set());
  const [mobileView,     setMobileView]     = useState('threads'); // 'threads' | 'chat'
  const [orderDrawer,    setOrderDrawer]    = useState(null); // order object | null

  const messagesEndRef  = useRef(null);
  const textareaRef     = useRef(null);
  const { msg: toastMsg, type: toastType, show: showToast } = useToast();

  // ── Fetch threads ────────────────────────────────────────────────────────────
  const fetchThreads = useCallback(async () => {
    try {
      setError('');
      const { data } = await supportChatAPI.getThreads();
      setThreads(data.threads || data);
    } catch {
      setError('Failed to load conversations.');
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // ── Fetch messages for active thread ────────────────────────────────────────
  const fetchMessages = useCallback(async (chatId) => {
    if (!chatId) return;
    setMessagesLoading(true);
    try {
      const { data } = await supportChatAPI.getMessages(chatId);
      setMessages(data.messages || data);
      // Mark as read
      setUnreadIds((prev) => { const n = new Set(prev); n.delete(chatId); return n; });
    } catch {
      showToast('Failed to load messages.', 'error');
    } finally {
      setMessagesLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeThread) {
      fetchMessages(activeThread.id);
      textareaRef.current?.focus();
    }
  }, [activeThread, fetchMessages]);

  // ── Scroll to bottom on new messages ────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Socket — real-time new messages ─────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    // Backend broadcasts after any new message — refetch (replace, no dups)
    const onChatUpdate = () => {
      fetchThreads();
      if (activeThread) fetchMessages(activeThread.id);
    };

    socket.on('chat:update', onChatUpdate);
    return () => {
      socket.off('chat:update', onChatUpdate);
    };
  }, [activeThread, fetchThreads, fetchMessages]);

  // ── Send reply ───────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = replyText.trim();
    if (!text || !activeThread || activeThread.status === 'locked') return;

    setSending(true);
    try {
      const { data } = await supportChatAPI.sendMessage({
        chat_id:          activeThread.id,
        message_text:     text,
        sender_type:      'staff',
        related_order_id: null,
      });
      setMessages((prev) => [...prev, data.message || data]);
      setReplyText('');
      textareaRef.current?.focus();
    } catch {
      showToast('Failed to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectThread = (thread) => {
    setActiveThread(thread);
    setMobileView('chat');
    setOrderDrawer(null);
  };

  // ── Filtered threads ─────────────────────────────────────────────────────────
  const filteredThreads = threads
    .filter((t) => {
      const q = searchQuery.toLowerCase();
      const matchQ = !q || t.customer_name?.toLowerCase().includes(q) || t.last_message_text?.toLowerCase().includes(q);
      const matchF = filterStatus === 'all' || t.status === filterStatus;
      return matchQ && matchF;
    })
    .sort((a, b) => {
      // Unread first, then by recency
      const aUnread = unreadIds.has(a.id) ? 1 : 0;
      const bUnread = unreadIds.has(b.id) ? 1 : 0;
      if (bUnread !== aUnread) return bUnread - aUnread;
      return new Date(b.last_message_at) - new Date(a.last_message_at);
    });

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const label = formatDate(msg.sent_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(msg);
    return groups;
  }, {});

  const unreadCount = unreadIds.size;

  return (
    <div className="sc-root">
      {toastMsg && (
        <div className={`sc-toast sc-toast--${toastType}`} role="status" aria-live="polite">{toastMsg}</div>
      )}

      {/* ── Page header (mobile only — shows above thread list) ───────────────── */}
      <div className="sc-page-header">
        <div className="sc-page-header__left">
          {mobileView === 'chat' && activeThread ? (
            <button
              className="sc-back-btn"
              onClick={() => setMobileView('threads')}
              aria-label="Back to conversations"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          ) : null}
          <div>
            <h1 className="sc-page-title">
              Support Chat
              {unreadCount > 0 && (
                <span className="sc-page-title__badge" aria-label={`${unreadCount} unread`}>{unreadCount}</span>
              )}
            </h1>
            <p className="sc-page-sub">
              {mobileView === 'chat' && activeThread
                ? activeThread.customer_name
                : 'Customer conversations'
              }
            </p>
          </div>
        </div>
        <button
          className="sc-refresh-btn"
          onClick={fetchThreads}
          aria-label="Refresh conversations"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Main panel ──────────────────────────────────────────────────────────── */}
      <div className="sc-panel">

        {/* ── Left: Thread list ───────────────────────────────────────────────── */}
        <aside
          className={`sc-threads-col${mobileView === 'chat' ? ' sc-threads-col--hidden-mobile' : ''}`}
          aria-label="Conversations"
        >
          {/* Search + filter */}
          <div className="sc-threads-toolbar">
            <div className="sc-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations…"
                className="sc-search__input"
                aria-label="Search conversations"
              />
            </div>
            <div className="sc-filter-tabs" role="group" aria-label="Filter by status">
              {['all', 'unlocked', 'locked'].map((s) => (
                <button
                  key={s}
                  className={`sc-filter-tab${filterStatus === s ? ' sc-filter-tab--active' : ''}`}
                  onClick={() => setFilterStatus(s)}
                  aria-pressed={filterStatus === s}
                >
                  {s === 'all' ? 'All' : s === 'unlocked' ? 'Active' : 'Locked'}
                </button>
              ))}
            </div>
          </div>

          {/* Thread list */}
          <div className="sc-threads-list" role="list" aria-label="Conversation threads">
            {threadsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="sc-thread-skeleton" aria-hidden="true" />
              ))
            ) : filteredThreads.length === 0 ? (
              <div className="sc-threads-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>{searchQuery ? 'No conversations match.' : 'No active conversations.'}</p>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={activeThread?.id === thread.id}
                  unread={unreadIds.has(thread.id)}
                  onClick={() => handleSelectThread(thread)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Right: Chat window + Order Drawer ─────────────────────────────────── */}
        <div className={`sc-chat-area${orderDrawer ? ' sc-chat-area--drawer-open' : ''}`}>
        <section
          className={`sc-chat-col${mobileView === 'threads' ? ' sc-chat-col--hidden-mobile' : ''}`}
          aria-label="Chat window"
        >
          {!activeThread ? (
            <NoChatSelected />
          ) : (
            <>
              {/* Chat header */}
              <div className="sc-chat-header">
                <div className="sc-chat-header__left">
                  <Avatar name={activeThread.customer_name} />
                  <div>
                    <p className="sc-chat-header__name">{activeThread.customer_name}</p>
                    <p className="sc-chat-header__meta">
                      {activeThread.customer_email}
                      <span className="sc-chat-header__dot" aria-hidden="true" />
                      <ThreadStatusBadge status={activeThread.status} />
                    </p>
                  </div>
                </div>

                {/* Order chips — click to open drawer */}
                {activeThread.active_orders?.length > 0 && (
                  <div className="sc-chat-header__orders">
                    {activeThread.active_orders.map((o) => (
                      <button
                        key={o.id}
                        className={`sc-chat-header__order-chip${orderDrawer?.id === o.id ? ' sc-chat-header__order-chip--active' : ''}`}
                        onClick={() => setOrderDrawer(orderDrawer?.id === o.id ? null : o)}
                        aria-expanded={orderDrawer?.id === o.id}
                        aria-label={`View details for ${o.order_number}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                        </svg>
                        {o.order_number}
                        <span className={`sc-chat-header__order-status sc-chat-header__order-status--${o.status}`}>
                          {o.status.replace(/_/g, ' ')}
                        </span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="sc-messages" aria-live="polite" aria-label="Messages">
                {messagesLoading ? (
                  <div className="sc-messages-loading">
                    <div className="sc-spinner" aria-label="Loading messages…" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="sc-messages-empty">
                    <p>No messages yet. Say hello!</p>
                  </div>
                ) : (
                  Object.entries(groupedMessages).map(([date, msgs]) => (
                    <div key={date}>
                      <DateDivider label={date} />
                      {msgs.map((msg) => (
                        <MessageBubble
                          key={msg.id}
                          message={msg}
                          isStaff={msg.sender_type === 'staff'}
                        />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} aria-hidden="true" />
              </div>

              {/* Reply bar */}
              <div className="sc-reply">
                {activeThread.status === 'locked' ? (
                  <div className="sc-reply__locked">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    This conversation is locked — the customer has no active orders.
                  </div>
                ) : (
                  <div className="sc-reply__input-wrap">
                    <textarea
                      ref={textareaRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                      className="sc-reply__textarea"
                      rows={2}
                      disabled={sending}
                      aria-label="Reply message"
                    />
                    <button
                      className="sc-reply__send"
                      onClick={handleSend}
                      disabled={!replyText.trim() || sending}
                      aria-label="Send message"
                      aria-busy={sending}
                    >
                      {sending
                        ? <span className="sc-spinner sc-spinner--sm" aria-label="Sending…" />
                        : (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="22" y1="2" x2="11" y2="13"/>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                          </svg>
                        )
                      }
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Order Drawer — slides in from right, pushes chat left */}
        {orderDrawer && (
          <OrderDrawer
            order={orderDrawer}
            onClose={() => setOrderDrawer(null)}
          />
        )}
        </div>
      </div>

      {error && (
        <div className="sc-error" role="alert">
          <p>{error}</p>
          <button className="sc-error__retry" onClick={fetchThreads}>Retry</button>
        </div>
      )}
    </div>
  );
}