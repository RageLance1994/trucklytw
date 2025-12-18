const form = document.querySelector('form');
const inputs = form.querySelectorAll('input');
const [email, password] = inputs;
const submitBtn = form.querySelector('button[type="submit"]');


document.addEventListener('DOMContentLoaded', (ev) => {
    inputs.forEach((i) => {
        ['focus', 'input', 'click'].map((ev) => {
            inputs.forEach((i) => {
                i.addEventListener(ev, validateInputs)
            })
        })
    })
})

password.parentNode.querySelector('a').addEventListener('click',(ev) => {
    var visible = password.type == "text"; 
    ev.currentTarget.querySelector('i').classList.value = visible ? 'fa fa-eye-slash' : 'fa fa-eye'
    password.type = visible ? 'password' : 'text';
})




function isValidEmail(email) {
    // controlla che sia una stringa
    if (typeof email !== "string") return false;

    // regex RFC 5322 "safe-ish"
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim().toLowerCase());
}


function validateInputs(ev) {
    const valid = isValidEmail(email.value) && password.value.length > 0;
    if (submitBtn) {
        submitBtn.disabled = !valid;
        submitBtn.setAttribute('aria-disabled', String(!valid));
    }
}

// initialize state
validateInputs();
