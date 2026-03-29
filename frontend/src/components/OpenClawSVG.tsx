import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lobster, type LobsterTheme, DEFAULT_THEME } from './Lobster';

/**
 * Homepage hero lobster with interactive animations.
 * Hover = walking, mouseDown = charging, mouseUp = attacking.
 */
export default function OpenClawSVG({ theme = DEFAULT_THEME }: { theme?: LobsterTheme }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isCharging, setIsCharging] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);

  const handleMouseDown = () => setIsCharging(true);
  const handleMouseUp = () => {
    setIsCharging(false);
    setIsAttacking(true);
    setTimeout(() => setIsAttacking(false), 600);
  };
  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => { setIsHovered(false); setIsCharging(false); };

  const state = isAttacking ? 'attacking' as const : isCharging ? 'charging' as const : isHovered ? 'walking' as const : 'idle' as const;

  return (
    <motion.div
      className="relative cursor-pointer select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
    >
      <AnimatePresence>
        {isAttacking && (
          <motion.div
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 3, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 rounded-full bg-orange-500/20 pointer-events-none"
          />
        )}
      </AnimatePresence>
      <Lobster id="hero-claw" theme={theme} state={state} />
    </motion.div>
  );
}
