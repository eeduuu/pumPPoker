// Stable clockwise seat order, starting immediately after the human at the bottom.
// The dealer will rotate through seat IDs; it must never rename or reorder players.
export const layouts: Record<number, readonly (readonly [number, number])[]> = {
 1: [[50, 9]],
 2: [[27, 9], [73, 9]],
 3: [[16, 9], [50, 9], [84, 9]],
 4: [[10, 55], [27, 9], [73, 9], [90, 55]],
 5: [[10, 70], [10, 34], [50, 9], [90, 34], [90, 70]],
 6: [[10, 72], [10, 38], [27, 9], [73, 9], [90, 38], [90, 72]],
 7: [[10, 72], [10, 38], [16, 9], [50, 9], [84, 9], [90, 38], [90, 72]],
 8: [[10, 76], [10, 53], [10, 30], [36, 9], [64, 9], [90, 30], [90, 53], [90, 76]],
};

// Portrait layout follows the same clockwise seat IDs around an oval table.
// The unnumbered ninth position at the bottom is always the human player.
// The center stays available to the pot and community cards.
export const mobileLayouts: typeof layouts = {
 1: [[50, 13]],
 2: [[30, 18], [70, 18]],
 3: [[20, 74], [50, 13], [80, 74]],
 4: [[20, 75], [33, 14], [67, 14], [80, 75]],
 5: [[20, 77], [15, 33], [50, 13], [85, 33], [80, 77]],
 6: [[20, 78], [13, 36], [37, 13], [63, 13], [87, 36], [80, 78]],
 7: [[20, 91], [12, 73], [16, 31], [50, 12], [84, 31], [88, 73], [80, 91]],
 8: [[20, 91], [12, 73], [15, 31], [38, 12], [62, 12], [85, 31], [88, 73], [80, 91]],
};
