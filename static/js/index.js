const aboutSlider = document.querySelector(".about-slider");
let slide = 0;
setInterval(() => {
    slide = (slide + 1) % 3;
    aboutSlider.style.marginLeft = `${5 - slide * 100}%`;
}, 10000);