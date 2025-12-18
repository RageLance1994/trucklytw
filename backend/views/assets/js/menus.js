const getDom = (id) => {
    return (document.getElementById(id))
}


export function createMenu(target, features, startIndex, tomenu, dimension,onChanged) {
    var _fs = (features.map((f, i) => {
        var _f = `<a data-for="${tomenu}" class="feature${i == 0 ? ' active' : ''}${!f.visible ? ' mobileshow' : ''}" data-tab="${f.tab}"> ${f.name}</a>`
        return (_f)
    })).join('')

    var menu = `<div class="slider-menu-container">
                    <div class="slider-flex-v">
                        <div class="features">
                        ${_fs}
                        </div>
                        <div class="slider-rail">
                            <div class="slider-cursor"></div>
                        </div>
                    </div>
                </div>
                `




    target.innerHTML += menu
    const menuObj = target.getElementsByClassName('slider-menu-container')[0]
    var cursor = target.getElementsByClassName('slider-cursor')[0]
    var rail = target.getElementsByClassName('slider-rail')[0]
    const menuFeats = [].slice.call(menuObj.getElementsByClassName('feature'))


    menuFeats.map((_mf, idx) => {
        if (idx == startIndex) {
            setActiveFeature({ currentTarget: menuFeats[startIndex] }, cursor, rail, menuFeats, dimension)
        }


        _mf.addEventListener('click', (ev) => {
            setActiveFeature(ev, cursor, rail, menuFeats, dimension)
            if (typeof onChanged === 'function') onChanged(idx);

        }


        )
    })

    var resizeObserver = new ResizeObserver(rescaleMenus)
    resizeObserver.observe(menuObj)
}


function setActiveFeature(ev, cursor, rail, menuFeats, dimension) {
    var _afi = menuFeats.indexOf(menuFeats.find(element => element.classList.contains('active')))
    var _prevTab = getDom(menuFeats[_afi].getAttribute('data-tab'))
    ev.currentTarget.classList.add('active')
    menuFeats.filter(element => element != ev.currentTarget).map(o => o.classList.remove('active'))
    var margin = ev.currentTarget.offsetLeft
    var width = document.defaultView.getComputedStyle(ev.currentTarget, '').getPropertyValue('width')
    var targetTab = ev.currentTarget.getAttribute('data-tab')

    var mastertarget = document.querySelector(`#${ev.currentTarget.getAttribute('data-for')}`)
    var tabs = [].slice.call(mastertarget.children).filter(child => child.classList && (child.classList.contains('feedtab') || child.classList.contains('sidetab')))
    var tab = tabs.find(element => element.getAttribute('data-tab') === targetTab);
    if (!tab) {
        return;
    }
    var tabindex = tabs.indexOf(tab)
    var totalTabs = tabs.length;
    if (dimension == "vw") {
        var centerOffset = (totalTabs - 1) / 2; // Offset centrale per bilanciare il movimento
        var translateValue = -(tabindex - centerOffset) * 100; // Regola il punto di partenza
        mastertarget.style.transform = `translateX(${translateValue}${dimension})`;
    }
    else if (dimension == "%") {
        var centerOffset = (totalTabs - 1) / 2;
        var translateValue = -((tabindex - centerOffset) * (100 / totalTabs));
        mastertarget.style.transform = `translateX(${translateValue}%)`;
    }
    
    tab.classList.remove('hidden')
    
    tabs.filter(element => element != tab).map(c => c.classList.add('hidden'))


    cursor.style.width = width
    cursor.style.left = `${margin}px`
}

export function rescaleMenus() {
    var menus = [].slice.call(document.getElementsByClassName('slider-menu-container'))
    menus.map((_m) => {
        var features = [].slice.call(_m.getElementsByClassName('feature'))
        var rail = _m.getElementsByClassName('slider-rail')[0]
        var cursor = _m.getElementsByClassName('slider-cursor')[0]
        var activeFeature = features.find(element => element.classList.contains('active'))
        setActiveFeature({ currentTarget: activeFeature }, cursor, rail, features)
    })
}
