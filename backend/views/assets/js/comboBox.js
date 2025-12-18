var testoptions = [
    { text: 'foo', value: 'foo' },
    { text: 'bar', value: 'bar' },
    { text: 'boo', value: 'boo' },
    { text: 'far', value: 'far' },
]
export class ComboBox {
    constructor(container, options = testoptions,onChange = (ev) => {},onFocus = (ev) => {}) {
        this.container = typeof container != "object" ? document.querySelector(container) : container;
        this.options = Array.isArray(options) ? options : [];
        this.onChange = onChange; 
        this.onFocus = onFocus; 


        this.input = this.container.querySelector('input');
        if(this.options.length && this.options.length >0 ) this.input.value = this.options[0].value;
        this._optionsDom = [];

        this.showOverflower = this.showOverflower.bind(this)
        this.selectOption = this.selectOption.bind(this)
        this.filterByText = this.filterByText.bind(this)
        this.input.addEventListener('focus', this.showOverflower);
        
        this.input.addEventListener('blur', this.showOverflower);
        this.input.addEventListener('input', this.filterByText);
        this.init()

    }

    init() {
        this.overflower = document.createElement('div')
        this.hiddenInput = document.createElement('input')
        this.hiddenInput.type = "hidden";
        this.container.appendChild(this.hiddenInput);

        this.overflower.classList.value = "wrapper-v j-start a-start nopadding overlay scrollable-y combo-box hidden"
        this.overflower.style.minHeight = `min-content`;
        this.overflower.style.maxHeight = `max-content`
        this.overflower.style.top = "100%";
        this.container.insertBefore(this.overflower, this.input)
        this.buildOptions();
        this._selectFirstOption()
    }

    buildCells(arr){

        var html = `<div class="wrapper-h j-start a-center no_vpad combo-cells nowrap">
            ${arr.map((c) => {
                return(`<div class="wrapper-h combo-cell j-start a-center"><p>${c}</p></div>`)
            }).join('')}
        </div>`
            return(html)
    }

    buildOptions() {
        this.overflower.innerHTML = "";
        this._optionsDom = [];

        this.options.forEach((opt) => {

            var _x = document.createElement('div')
            _x.classList.value = "wrapper-h j-start a-start option h-min-content";
            _x.dataset.value = opt.value;
            _x.dataset.optext = Array.isArray(opt.text) ? opt.text[0] : opt.text; 

            _x.textContent = opt.text;
            Array.isArray(opt.text)  ? _x.innerHTML = this.buildCells(opt.text) : _x.textContent = opt.text; 

            _x.addEventListener('click', this.selectOption)
            this.overflower.appendChild(_x)

            this._optionsDom.push(_x)
        })

    }
    selectOption(ev) {

        this.input.value = ev.currentTarget.dataset.optext;
        this.hiddenInput.value = ev.currentTarget.dataset.value;
        this.filterByText({currentTarget:{value:""}})
        this.onChange(this.hiddenInput.value); 
    }

    showOverflower() {
        this.onFocus(); 
        
        var isHidden = !this.overflower.classList.contains('hidden')
        setTimeout(() => {
            this.overflower.classList.toggle('hidden');


        }, isHidden ? 100 : 0)

    }

    filterByText(ev) {
        const filter = ev.currentTarget.value.toLowerCase();
        const options = this.overflower.querySelectorAll('.option');

        options.forEach(opt => {
            const text = opt.textContent.toLowerCase();
            const value = opt.dataset.value.toLowerCase();

            if (text.includes(filter) || value.includes(filter)) {
                opt.classList.remove('filtered');
            } else {
                opt.classList.add('filtered');
            }
        });
    }

    _selectFirstOption() {
        if (this._optionsDom.length) {
            this._optionsDom[0].click();
        } else {
            this.hiddenInput.value = "";
            this.input.value = "";
        }
    }

    setOptions(options = []) {
        this.options = Array.isArray(options) ? options : [];
        this.buildOptions();
        this._selectFirstOption();
    }

    selectValue(value, silent = false) {
        if (!this._optionsDom.length) {
            this.hiddenInput.value = "";
            this.input.value = "";
            return;
        }
        var match = this._optionsDom.find((opt) => opt.dataset.value == value);
        if (match) {
            if (silent) {
                this.input.value = match.dataset.optext;
                this.hiddenInput.value = match.dataset.value;
                this.filterByText({ currentTarget: { value: "" } });
            } else {
                match.click();
            }
        } else {
            this._selectFirstOption();
        }
    }
}

