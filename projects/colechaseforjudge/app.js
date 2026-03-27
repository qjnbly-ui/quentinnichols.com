// Minimal enhancements for concept draft site

// Update year dynamically if needed later
const yearElements = document.querySelectorAll('.year');
if (yearElements.length) {
  const currentYear = new Date().getFullYear();
  yearElements.forEach(el => el.textContent = currentYear);
}

// Simple console message for debugging / professionalism
console.log('Cole Chase concept site loaded.');

// Placeholder for future features:
// - Form handling
// - Email signup
// - Navigation interactions
