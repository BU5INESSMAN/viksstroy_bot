import React from 'react';

export default function SupportButton() {
  return (
    <a
      href="https://t.me/BU5INESSMAN"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 z-[100] flex items-center justify-center group"
      title="Связаться с техподдержкой"
    >
      <span className="text-2xl leading-none">💬</span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs group-hover:ml-3 transition-all duration-300 ease-in-out font-bold text-sm">
        Техподдержка
      </span>
    </a>
  );
}