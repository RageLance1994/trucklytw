var types = ['good', 'bad', 'warning']
var icons = ['check', 'ban', 'warning']
var animations = ['pulse-success', 'shake_danger', 'shake_warning']
var banner = null;
var notiOverlay = document.querySelector('.notioverlay')
// var bannerTitle   = banner.querySelectorAll('.noti-title')[0]
// var bannerContent = banner.querySelectorAll('.small')[0]
var hideTimeout = null;



const buildDom = (type, title, text) => {
    var notiBanner = document.createElement('div');
    notiBanner.classList.value = `wrapper-v notification nopadding w-min-content h-min-content hidden ${type}`

    notiBanner.innerHTML =
        `
                                <div class="wrapper-h j-start a-center bordered-bottom">
                                    <a class="noti-icon L"><i class="fa fa-${icons[types.indexOf(type)]}" style="margin:6px">
                                    </i>
                                    </a>
                                    <h1 style="padding-left:12px" class="bordered-bottom-light big thick">${title}</h1>
                                    
                                </div>     
                                <div class="wrapper-h" style="padding-top:0px">
                                    <p class="medium" style="width:100%;  text-align:start">${text}</p>
                                </div>
                            `
    setTimeout(() => { notiBanner.querySelector('.noti-icon').classList.add(animations[types.indexOf(type)]) }, 500)


    notiOverlay.appendChild(notiBanner)
    return (notiBanner)

}




window.notify = (type, title, text) => {
    var noti = buildDom(type, title, text)
    setTimeout(() => {
        noti.classList.remove('hidden')
        setTimeout(() => {
            noti.classList.add('hidden')
            setTimeout(() => {
                noti.remove()
            }, 250)
        }, 10000)
    })
}


