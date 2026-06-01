// Tab switching logic
function switchTab(event, tabId) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    // Show current tab content and activate button
    const activeContent = document.getElementById(tabId);
    activeContent.classList.add('active');
    event.currentTarget.classList.add('active');

    // Reset slide timers for the new tab
    resetCarouselTimer(activeContent);
}

// Carousel slider logic
function changeSlide(dotElement, slideIndex) {
    const parentContainer = dotElement.closest('.showcase-media');
    const images = parentContainer.querySelectorAll('.media-carousel img');
    const dots = parentContainer.querySelectorAll('.carousel-nav .dot');

    // Deactivate all images and dots
    images.forEach(img => img.classList.remove('active-slide'));
    dots.forEach(dot => dot.classList.remove('active'));

    // Activate the selected image and dot
    images[slideIndex].classList.add('active-slide');
    dotElement.classList.add('active');
}

// Automated Carousel auto-play
let carouselTimers = {};

function startAutoPlay(container) {
    const images = container.querySelectorAll('.media-carousel img');
    const dots = container.querySelectorAll('.carousel-nav .dot');
    
    if (images.length <= 1) return;

    let currentIndex = 0;

    const timer = setInterval(() => {
        currentIndex = (currentIndex + 1) % images.length;
        
        // Simulates clicking the dot corresponding to the next slide
        if (dots[currentIndex]) {
            changeSlide(dots[currentIndex], currentIndex);
        }
    }, 4500);

    const containerId = container.closest('.tab-content').id;
    carouselTimers[containerId] = timer;
}

function resetCarouselTimer(activeTabContent) {
    // Clear all existing intervals to avoid leaks and conflicts
    Object.keys(carouselTimers).forEach(id => {
        clearInterval(carouselTimers[id]);
    });

    // Start auto play only for the active tab content
    const mediaContainer = activeTabContent.querySelector('.showcase-media');
    if (mediaContainer) {
        startAutoPlay(mediaContainer);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Start auto play for the first active tab content
    const initialActiveTab = document.querySelector('.tab-content.active');
    if (initialActiveTab) {
        const mediaContainer = initialActiveTab.querySelector('.showcase-media');
        if (mediaContainer) {
            startAutoPlay(mediaContainer);
        }
    }

    // Header scroll background threshold
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.glass-header');
        if (window.scrollY > 50) {
            header.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
            header.style.background = 'rgba(7, 10, 18, 0.9)';
        } else {
            header.style.boxShadow = 'none';
            header.style.background = 'rgba(11, 15, 25, 0.7)';
        }
    });
});
