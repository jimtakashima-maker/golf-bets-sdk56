import { create } from 'zustand';

type RoundState = {
  hole: number;
  scores: Record<string, number>;
  setScore: (playerId: string, score: number) => void;
  nextHole: () => void;
};

export const useRoundState = create<RoundState>((set) => ({
  hole: 1,
  scores: {},

  setScore: (playerId: string, score: number) =>
    set((state) => ({
      scores: { ...state.scores, [playerId]: score }
    })),

  nextHole: () =>
    set((state) => ({
      hole: state.hole + 1
    })),
}));