(() => {
  const sections = document.querySelectorAll('.checkout-recommendations');

  sections.forEach((section) => {
    section.setAttribute('data-initialized', 'true');
  });
})();
