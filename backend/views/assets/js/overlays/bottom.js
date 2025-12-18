document.querySelector('a[data-close="bottom"]').addEventListener('click',(ev) => {
    document.querySelector(`#bottom_section`).classList.add('scrolled'); 
})