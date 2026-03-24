export function moveSelectedReel(state, delta) {
  if (state.reels.length === 0) return;
  state.selectedReelIndex = (state.selectedReelIndex + delta + state.reels.length) % state.reels.length;
  clampSelectedFace(state);
}

export function moveSelectedFace(state, delta) {
  const reel = state.reels[state.selectedReelIndex];
  const faceCount = reel?.faces?.length ?? reel?.sides ?? 0;
  if (faceCount <= 0) return;
  state.selectedFaceIndex = (state.selectedFaceIndex + delta + faceCount) % faceCount;
}

export function clampSelectedReel(state) {
  state.selectedReelIndex = Math.max(0, Math.min(state.selectedReelIndex, Math.max(0, state.reels.length - 1)));
  clampSelectedFace(state);
}

export function clampSelectedFace(state) {
  const reel = state.reels[state.selectedReelIndex];
  const faceCount = reel?.faces?.length ?? reel?.sides ?? 0;
  if (faceCount <= 0) {
    state.selectedFaceIndex = 0;
    return;
  }
  state.selectedFaceIndex = Math.max(0, Math.min(state.selectedFaceIndex, faceCount - 1));
}
