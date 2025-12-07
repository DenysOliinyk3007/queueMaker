
const containerClass = document.querySelector('.main-section-container');
const textClass = document.querySelector('.test-text');
const btnClass = document.querySelector('.btn');
const getBtnClass = document.querySelector('.get-btn');
const selectedWells = [];
const modalOverlay = document.querySelector('.modal-overlay');
const closeModalBtn = document.querySelector('.close-modal');
const modalWindow = document.querySelector('.modal');
const modalForm = document.querySelector('.modal-form');
///////////////////////////

function getWellPositions(){
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const cols = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']; 
    let output = [];

    for (const row of rows){
        output.push(cols.map((col) => row+col));
    }
    output = output.flat();

    return output;
}

function renderRack(){

    const rackHtml = [];
    for (let i = 0; i<=5; i++){
        rackHtml.push('<div class="rack"></div>');
    }

    containerClass.innerHTML += rackHtml.join('')
    const rackClass = document.querySelectorAll('.rack');
    rackClass.forEach((rack, idx) => {
        const wellsHtml = [];
        for (let j = 0; j<=95; j++){
            wellsHtml.push(`<div class="well ${(idx+1)+output[j]}"></div>`);
        }
        rack.innerHTML = wellsHtml.join('');
    })
}

function handleClick(evt){
    evt.target.style.backgroundColor = 'blue';
    selectedWells.push(evt.target.classList[1]);
}


function handleBtnClick(){
    wellClass.forEach(well => {
        well.style.backgroundColor = 'black';
    })
}

///////////////////////////


const output = getWellPositions();

renderRack();

const wellClass = document.querySelectorAll('.well');
    
wellClass.forEach(well => {
    well.addEventListener('click', handleClick);
})

btnClass.addEventListener('click', handleBtnClick);


getBtnClass.addEventListener('click', () => {
    modalOverlay.classList.toggle('active');
});

closeModalBtn.addEventListener('click', () => {
    modalOverlay.classList.toggle('active');
});