// render 4 role cards at neutral state
// call revealWinner(container, winnerIndex) after a delay to animate reveal
function buildVoteCards(containerEl, roles) {
  containerEl.innerHTML = '';
  roles.forEach(role => {
    const card = document.createElement('div');
    card.className = 'vote-role-card';
    card.dataset.roleId = role.id;
    card.innerHTML = `
      <img src="${role.card}" alt="${role.name}" class="vrc-img">
      <div class="vrc-power">
        <span class="vrc-label">VOTE POWER</span>
        <div class="vrc-dots">${renderVoteDots(role.votePower)}</div>
      </div>
    `;
    containerEl.appendChild(card);
  });
}

function revealWinner(containerEl, winnerId) {
  containerEl.querySelectorAll('.vote-role-card').forEach(card => {
    if (card.dataset.roleId === winnerId) {
      card.classList.add('vote-role-card--winner');
      const badge = document.createElement('div');
      badge.className = 'vrc-winner-badge';
      badge.textContent = 'WINNER';
      card.appendChild(badge);
    } else {
      card.classList.add('vote-role-card--loser');
    }
  });
}
