// $Id: views.js 469 2017-06-10 11:56:24Z superuser $

class View
{
    constructor(element) {
        this.element = element;
    }

    addEventListener(type, handler) {
        this.element.addEventListener(type, handler);
    }

    removeEventListener(type, handler) {
        this.element.removeEventListener(type, handler);
    }

    dispatchEvent(event) {
        return this.element.dispatchEvent(event);
    }
}

class ListViewItem extends View
{
    constructor(element) {
        super(element);
    }

    static create() {
        var element = document.createElement('div');
        return new ListViewItem(element);
    }
}

class CommandListViewItem extends ListViewItem
{
    constructor(element) {
        super(element);
    }

    static create() {
        var element = document.createElement('div');
        element.classList.add('lv-item');

        return new CommandListViewItem(element);
    }

    bind(command, target) {
        this.element.textContent = command.name;
        this.element.title = command.description;
        this.element.command = command;
        this.element.target = target;
    }

}

class ProcessListViewItem extends ListViewItem
{
    constructor(element) {
        super(element);
    }

    static create() {
        var element = document.createElement('div');
        element.classList.add('lv-item');

        var label = document.createElement('div');
        label.classList.add('lvi-label');
        element.appendChild(label);

        var led = document.createElement('span');
        led.classList.add('lvi-led');
        label.appendChild(led);

        var caption = document.createElement('span');
        caption.classList.add('lvi-caption');
        label.appendChild(caption);

        var info = document.createElement('div');
        info.classList.add('lvi-info');
        element.appendChild(info);

        return new ProcessListViewItem(element);
    }

    set online(flag) {
        if (flag && !this.element.classList.contains('online')) {
            this.element.classList.add('online');
        }
        else if (this.element.classList.contains('online')) {
            this.element.classList.remove('online');
        }
    }

    get online() {
        return this.element.classList.contains('online');
    }

    set warning(flag) {
        if (flag && !this.element.classList.contains('warning')) {
            this.element.classList.add('warning');
        }
        else if (this.element.classList.contains('warning')) {
            this.element.classList.remove('warning');
        }
    }

    get warning() {
        return this.element.classList.contains('warning');
    }

    set name(text) {
        var element = this.element.querySelector('.lvi-caption');
        element.textContent = text;
    }

    set info(text) {
        var element = this.element.querySelector('.lvi-info');
        element.textContent = text;
    }
}

class ListView extends View
{
    constructor(element) {
        super(element);
        this.selectedIndex = -1;
        this.element.addEventListener('click', this.onClick.bind(this));
    }

    set selectedIndex(index) {
        if (index == this._selectedIndex) return;
        this._selectedIndex = index;
        var event = new Event('change');
        //event.view = this;
        event.selectedIndex = this._selectedIndex;
        this.dispatchEvent(event);
    }

    get selectedIndex() {
        return this._selectedIndex;
    }

    get count() {
        return this.element.childElementCount;
    }

    add(item) {
        item.element.itemIndex = this.element.childElementCount;
        this.element.appendChild(item.element);
        item.element.addEventListener('click', this.onItemClick.bind(this));
    }

    clear() {
        this.selectedIndex = -1;
        this.element.innerHTML = '';
    }

    onItemClick(e) {
        if (-1 != this.selectedIndex) {
            this.element.children[this.selectedIndex].classList.remove('selected');
        }
        this.selectedIndex = e.currentTarget.itemIndex;
        e.currentTarget.classList.add('selected');
        e.stopPropagation();
    }

    onClick(e) {
        if (e.currentTarget == this.element) {
            if (-1 != this.selectedIndex) {
                this.element.children[this.selectedIndex].classList.remove('selected');
            }
            this.selectedIndex = -1;
        }
    }
}

