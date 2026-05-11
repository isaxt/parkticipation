const REVIEW_DATA = [
  {
    name: 'Dog Walker',
    card: 'image/dogwalker-card.png',
    reviews: [
      { text: "Perfect park to walk my dog!",              stars: 5, show: c => c.dog_park > 0 },
      { text: "My dog loves the dog run here! Nicely cared.", stars: 4, show: c => c.grass_tile >= 3 },
      { text: "This park sucks! No space for my dog.",     stars: 1, show: c => !c.dog_park },
      { text: "I wish there was a more grassy area for my dog.", stars: 2, show: c => c.grass_tile < 3 },
    ],
  },
  {
    name: 'Biker / Skater',
    card: 'image/biker-card.png',
    reviews: [
      { text: "Good refreshing spot for a morning run.",   stars: 4, show: c => c.concrete_tile >= 4 },
      { text: "Cool.",                                     stars: 4, show: c => c.reg_fence > 0 },
      { text: "Can't bike or skate here. Boo.",            stars: 1, show: c => c.concrete_tile < 4 },
      { text: "Why is there no sidewalk here?",            stars: 2, show: c => !c.concrete_tile },
    ],
  },
  {
    name: 'Chess Player',
    card: 'image/chesser-card.png',
    reviews: [
      { text: "I come here every day and it's pretty chill!", stars: 5, show: c => c.bench > 0 },
      { text: "This is my favorite park to play chess. Very nice!", stars: 5, show: c => c.bench > 0 && c.concrete_tile >= 2 },
      { text: "I wish there were more tables for me to play chess...", stars: 2, show: c => !c.bench },
      { text: "Too much noise here and it bothers me a lot.", stars: 1, show: c => c.playground > 0 },
    ],
  },
  {
    name: 'Idler',
    card: 'image/idler-card.png',
    reviews: [
      { text: "My favorite park to sit around and daydream.", stars: 5, show: c => c.bench > 0 },
      { text: "Perfect place to have a picnic!",            stars: 4, show: c => c.grass_tile >= 3 },
      { text: "I don't really enjoy sitting around this park.", stars: 2, show: c => !c.bench },
      { text: "This park is too dirty. Eww!",               stars: 1, show: c => c.dirt_tile >= 4 },
    ],
  },
  {
    name: 'Park Staff',
    card: 'image/parkstaff-card.png',
    reviews: [
      { text: "Very manageable park to maintain!",          stars: 4, show: c => _total(c) <= 20 },
      { text: "This park is a nightmare to maintain.",      stars: 1, show: c => _total(c) > 20 },
    ],
  },
  {
    name: 'Government Worker',
    card: 'image/government-card.png',
    reviews: [
      { text: "This is a clean, safe park for families. Well recommended.", stars: 5, show: c => c.lights_lamps > 0 && !c.spiked_fence },
      { text: "Not very safe. I will be reporting here soon.", stars: 1, show: c => c.spiked_fence > 0 },
    ],
  },
  {
    name: 'Homeless',
    card: 'image/homeless-card.png',
    reviews: [
      { text: "Lovely park!",                              stars: 5, show: c => c.bench > 0 || c.bathroom > 0 },
      { text: "Not the most accommodating park.",          stars: 2, show: c => !c.bench && !c.bathroom },
    ],
  },
  {
    name: 'Party Goer',
    card: 'image/djmusi-card.png',
    reviews: [
      { text: "Love the vibe here!",                       stars: 5, show: c => c.playground > 0 || c.dog_park > 0 },
      { text: "I always have a wonderful time here!",      stars: 4, show: c => c.grass_tile >= 3 },
      { text: "What's the use of a public space if you can't play music?", stars: 1, show: c => c.spiked_fence > 0 },
    ],
  },
  {
    name: 'Pedestrian',
    card: 'image/pedestrian-card.png',
    reviews: [
      { text: "I love walking around this park! It is very accommodating!", stars: 5, show: c => c.concrete_tile >= 4 },
      { text: "A nice lovely park to pass by every day.",  stars: 4, show: c => c.water_tile > 0 || c.grass_tile >= 3 },
      { text: "It is quite difficult to walk around leisurely in this park.", stars: 2, show: c => c.concrete_tile < 2 },
      { text: "I try to avoid this park every day.",       stars: 1, show: c => c.spiked_fence > 0 },
    ],
  },
];

function _total(c) {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

function _countBoard(board) {
  const c = {};
  if (!board) return c;
  for (let r = 0; r < board.length; r++) {
    for (let col = 0; col < board[r].length; col++) {
      const k = board[r][col];
      if (k) c[k] = (c[k] || 0) + 1;
    }
  }
  return c;
}

function _stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function buildReviews(board) {
  const counts = _countBoard(board);
  const noCamera = _total(counts) === 0;

  const list = document.getElementById('reviews-list');
  if (!list) return;
  list.innerHTML = '';

  let totalStars = 0, totalCount = 0;

  REVIEW_DATA.forEach(role => {
    const visible = role.reviews.filter(r => noCamera || r.show(counts));
    if (!visible.length) return;

    visible.forEach(rev => {
      totalStars += rev.stars;
      totalCount++;

      const good = rev.stars >= 3;
      const card = document.createElement('div');
      card.className = 'gm-review-card';
      card.innerHTML = `
        <div class="gm-reviewer-row">
          <img src="${role.card}" class="gm-avatar" alt="${role.name}">
          <div class="gm-reviewer-meta">
            <div class="gm-reviewer-name">${role.name}</div>
            <div class="gm-stars ${good ? 'gm-stars--pos' : 'gm-stars--neg'}" title="${rev.stars} out of 5">${_stars(rev.stars)}</div>
          </div>
        </div>
        <p class="gm-review-text">${rev.text}</p>
        <div class="gm-helpful-row">
          <span class="gm-helpful-label">Helpful?</span>
          <button class="gm-helpful-btn" onclick="this.classList.toggle('gm-helpful-btn--active')">&#128077;</button>
        </div>
      `;
      list.appendChild(card);
    });
  });

  // Update header summary
  const avg = totalCount ? (totalStars / totalCount).toFixed(1) : '—';
  const avgNum = parseFloat(avg);
  const roundedAvg = Math.round(avgNum);

  const elAvg   = document.getElementById('gm-avg');
  const elStars = document.getElementById('gm-stars');
  const elCount = document.getElementById('gm-count');
  if (elAvg)   elAvg.textContent   = avg;
  if (elStars) elStars.textContent = totalCount ? _stars(roundedAvg) : '';
  if (elCount) elCount.textContent = totalCount ? `${totalCount} review${totalCount !== 1 ? 's' : ''}` : '';

  if (!totalCount) {
    list.innerHTML = '<p class="gm-empty">No reviews yet.</p>';
  }
}
