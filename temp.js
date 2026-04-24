(() => {
	window.addEventListener('DOMContentLoaded', () => {
		const slides = Array.from(document.querySelectorAll('.slide'));
		if (slides.length < 2) return;

		const times = [7000, 1000, 5000];
		let i = 0;
		let started = false;

		function next() {
			if (i >= slides.length - 1) return;
			slides[i].classList.remove('active');
			i += 1;
			slides[i].classList.add('active');
			slides[0].classList.remove('click');
			if (i < slides.length - 1) {
				setTimeout(next, times[i - 1] || 5000);
			}
		}

		function start() {
			if (started) return;
			started = true;
			document.body.classList.add('started');
			next();
		}

		document.addEventListener('click', start, { once: true });
		document.addEventListener('touchstart', start, { once: true });
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') start();
		});
	});
})();
