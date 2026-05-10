import { useState } from 'react'

export default function ChatView() {
  // input holds the current value of the textarea as the user types.
  // Every keystroke calls setInput, keeping React's state in sync.
  const [input, setInput] = useState('')

  return (
    // The outer div must fill the full height so the input bar pins to the bottom.
    // flex-col stacks children vertically: header → messages → input.
    <div className="h-full flex flex-col">

      {/* Page header */}
      <div className="px-8 py-6 border-b border-stone-200 bg-white shrink-0">
        <h2 className="text-xl font-semibold text-stone-800">Chat</h2>
        <p className="text-stone-400 text-sm mt-0.5">
          Ask questions about your finances — AI coming soon
        </p>
      </div>

      {/*
        Message list
        flex-1 makes this area grow to fill all available space between
        the header and the input bar. overflow-y-auto adds a scrollbar
        when messages overflow the height.
      */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">

        {/* Placeholder welcome message so the screen isn't blank */}
        <div className="flex gap-3 max-w-xl">
          {/* Avatar bubble */}
          <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center
                          shrink-0 text-rose-700 text-xs font-bold">
            UA
          </div>
          {/* Message bubble */}
          <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-none
                          px-4 py-3 text-sm text-stone-700 leading-relaxed">
            Hi! I'm your Unveiled Atelier assistant. Once connected, you'll be able
            to ask things like "What was my revenue in March?" or "Which expense
            category was highest this quarter?"
          </div>
        </div>

      </div>

      {/* Input bar — shrink-0 keeps it at a fixed height, never compressed */}
      <div className="shrink-0 px-8 py-4 border-t border-stone-200 bg-white">
        <div className="flex gap-3 items-end">

          {/*
            Textarea instead of <input> so the user can write multi-line questions.
            rows={1} starts it small; they can expand by typing.
            onChange fires on every keystroke and updates the input state.
          */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something about your business..."
            rows={1}
            className="flex-1 resize-none border border-stone-300 rounded-xl px-4 py-3
                       text-sm focus:outline-none focus:ring-2 focus:ring-rose-300
                       focus:border-transparent placeholder:text-stone-400"
          />

          {/* Send button — disabled until AI is wired up */}
          <button
            disabled
            className="px-5 py-3 bg-rose-800 text-white text-sm rounded-xl
                       opacity-40 cursor-not-allowed shrink-0"
          >
            Send
          </button>

        </div>
        <p className="text-xs text-stone-400 mt-2">AI not connected yet</p>
      </div>

    </div>
  )
}
