const ALL_ROLES = [
  {
    id: 'government',
    name: 'GOVERNMENT OFFICIAL',
    votePower: 5,
    question: 'Imagine you are a local government official. What are things you think citizens would want in a park?',
    card: 'image/government-card.png',
  },
  {
    id: 'parkstaff',
    name: 'PARK STAFF',
    votePower: 3,
    question: 'Imagine you are a part of the Park Maintenance Staff. What are things you need?',
    card: 'image/parkstaff-card.png',
  },
  {
    id: 'biker',
    name: 'BIKER',
    votePower: 2,
    question: 'What is it like to experience a park as a biker/skater?',
    card: 'image/biker-card.png',
  },
  {
    id: 'dogwalker',
    name: 'DOG WALKER',
    votePower: 2,
    question: 'How do you imagine a safe park environment for a dog?',
    card: 'image/dogwalker-card.png',
  },
  {
    id: 'idler',
    name: 'IDLER',
    votePower: 2,
    question: 'Imagine you are passing by a park. What would you want to see?',
    card: 'image/idler-card.png',
  },
  {
    id: 'djmusi',
    name: 'PARTY GOER/DJ',
    votePower: 2,
    question: 'Imagine a fun, and interactive experience for your audience!',
    card: 'image/djmusi-card.png',
  },
  {
    id: 'chesser',
    name: 'CHESSER',
    votePower: 1,
    question: 'What would you need to comfortably play chess in the park?',
    card: 'image/chesser-card.png',
  },
  {
    id: 'homeless',
    name: 'HOMELESS',
    votePower: 1,
    question: 'What would you ideally want and need in a park?',
    card: 'image/homeless-card.png',
  },
  {
    id: 'pedestrian',
    name: 'PEDESTRIAN',
    votePower: 1,
    question: 'What would make a park feel welcoming and safe for someone just passing through?',
    card: 'image/pedestrian-card.png',
  },
];

function pickFourRoles() {
  return [...ALL_ROLES].sort(() => Math.random() - 0.5).slice(0, 4);
}

function getRoundWinner(roles) {
  return [...roles].sort((a, b) => b.votePower - a.votePower)[0];
}

function renderVoteDots(power, max = 5) {
  let html = '';
  for (let i = 0; i < max; i++) {
    html += `<span class="vdot${i < power ? ' vdot--on' : ''}"></span>`;
  }
  return html;
}
