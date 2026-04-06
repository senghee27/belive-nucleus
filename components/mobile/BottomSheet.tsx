'use client'

import { motion, AnimatePresence } from 'framer-motion'

export function BottomSheet({ isOpen, onClose, height = '70vh', children }: {
  isOpen: boolean; onClose: () => void; height?: string; children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[100]"
          />
          <motion.div
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => { if (info.offset.y > 100) onClose() }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-[#0D1525] rounded-t-[20px] z-[101] overflow-y-auto"
            style={{ height, paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="w-10 h-1 bg-[#2E4070] rounded-full mx-auto mt-3 mb-1 cursor-grab" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
