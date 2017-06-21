/* This file is part of Supermon project

 Supermon is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 Supermon is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with Supermon.  If not, see http://www.gnu.org/licenses/
 */

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
}

class EventListViewItem extends ListViewItem
{
    constructor() {
        if (0 < arguments.length) {
            super(arguments[0]);
        }
        else {
            var element = document.createElement('div');
            element.classList.add('lv-item');
            super(element);
        }
    }

    set text(str) {
        this.element.textContent = str;
    }

    get text() {
        return this.element.textContent;
    }
}

class CommandListViewItem extends ListViewItem
{
    constructor() {
        if (0 < arguments.length) {
            super(arguments[0]);
        }
        else {
            var element = document.createElement('div');
            element.classList.add('lv-item');
            super(element);
        }
    }

    bind(commandId, target) {
        var command = target.commands[commandId];
        this.element.textContent = command.name;
        this.element.title = command.description || command.name;
        this.element.command = commandId;
        this.element.target = target;
    }
}

class ChannelsListViewItem extends ListViewItem
{
    constructor() {
        if (0 < arguments.length) {
            super(arguments[0]);
        }
        else {
            var element = document.createElement('div');
            element.classList.add('item');
            super(element);
        }
    }

    bind(key, client) {
        var channel = client.channels[key];
        this.element.textContent = channel.name;
        this.element.title = channel.description || channel.name;
        this.element.target = { name: client.name, instance: client.instance, channel: key };
    }
}

class ProcessListViewItem extends ListViewItem
{
    constructor() {
        if (0 < arguments.length) {
            super(arguments[0]);
        }
        else {
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

            super(element);
        }
    }

    set online(flag) {
        if (flag && !this.element.classList.contains('online')) {
            this.element.classList.add('online');
        }
        else if (!flag && this.element.classList.contains('online')) {
            this.element.classList.remove('online');
            this.alert = false;
        }
    }

    get online() {
        return this.element.classList.contains('online');
    }

    set alert(flag) {
        if (flag && !this.element.classList.contains('alert')) {
            this.element.classList.add('alert');
        }
        else if (!flag && this.element.classList.contains('alert')) {
            this.element.classList.remove('alert');
        }
    }

    get alert() {
        return this.element.classList.contains('alert');
    }

    set name(text) {
        var element = this.element.querySelector('.lvi-caption');
        element.textContent = text;
    }

    set info(text) {
        var element = this.element.querySelector('.lvi-info');
        element.textContent = text;
        element.title = text;
    }
}

class ListView extends View
{
    constructor(element) {
        super(element);
        this.maxCount = 0;
        this._selectedIndex = -1;
        this.autoScroll = true;
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
        if (0 < this.maxCount) {
            var removedCount = 0;
            while (this.count >= this.maxCount) {
                if (0 == this.selectedIndex) {
                    this.selectedIndex = -1;
                }
                else if (0 < this.selectedIndex) {
                    --this._selectedIndex;
                }
                this.element.removeChild(this.element.firstElementChild);
                ++removedCount;
            }
            if (removedCount > 0) {
                var children = Array.from(this.element.children);
                children.forEach(function(child) {
                    child.itemIndex -= removedCount;
                });
            }
        }
        item.element.itemIndex = this.element.childElementCount;
        this.element.appendChild(item.element);
        item.element.addEventListener('click', this.onItemClick.bind(this));
        if (-1 == this.selectedIndex && this.autoScroll) {
            item.element.scrollIntoView({behavior: 'instant'});
        }
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

