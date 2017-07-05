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
        this.splitter = { h: null, v: null };
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

    createHSplitter(options) {
        var config = options || { offset: 4, size: '8px' };
        if (null == this.splitter.h) {
            var div = document.createElement('div');
            div.classList.add('h-split');
            div.style.position = 'absolute';

            var onresize = function(e) {
                var r = this.element.getBoundingClientRect();
                div.style.left = Math.ceil(r.left) + 'px';
                div.style.top = (Math.floor(r.bottom) - config.offset) + 'px';
                div.style.width = Math.floor(r.width) + 'px';
                div.style.height = config.size;
            }.bind(this);

            onresize();

            window.addEventListener('resize', onresize);
            window.addEventListener('split', onresize);

            this.element.appendChild(div);

            div.addEventListener('mousedown', function(e) {
                var parentOffsetY = div.parentElement.getBoundingClientRect().top;
                var offset = { x: e.offsetX, y: e.offsetY };
                var onmousemove = function(e) {
                    var y = e.clientY - offset.y;
                    div.style.top = y + 'px';
                    div.parentElement.style.flexBasis = (y - parentOffsetY + config.offset) + 'px';
                    e.preventDefault();
                    e.stopPropagation();
                };
                var onmouseup = function(e) {
                    document.removeEventListener('mousemove', onmousemove, true);
                    document.removeEventListener('mouseup', onmouseup, true);
                    document.body.style.cursor = '';
                    onresize();
                };
                document.body.style.cursor = 'row-resize';
                document.addEventListener('mouseup', onmouseup, true);
                document.addEventListener('mousemove', onmousemove, true);
                e.preventDefault();
                e.stopPropagation();
            }, true);

            this.splitter.h = div;
        }
    }

    createVSplitter() {
        if (null == this.splitter.v) {
            var div = document.createElement('div');
            div.classList.add('v-split');
            div.style.position = 'absolute';

            var onresize = function(e) {
                var r = this.element.getBoundingClientRect();
                div.style.left = (Math.floor(r.right) - 4) + 'px';
                div.style.width = '8px';
                div.style.top = Math.ceil(r.top) + 'px';
                div.style.height = Math.floor(r.height) + 'px';
            }.bind(this);

            onresize();

            window.addEventListener('resize', onresize);

            this.element.appendChild(div);

            div.addEventListener('mousedown', function(e) {
                var offset = { x: e.offsetX, y: e.offsetY };
                var onmousemove = function(e) {
                    var x = e.clientX - offset.x;
                    div.style.left = x + 'px';
                    div.parentElement.style.flexBasis = (x + 4) + 'px';
                    e.preventDefault();
                    e.stopPropagation();
                };
                var onmouseup = function(e) {
                    document.removeEventListener('mousemove', onmousemove, true);
                    document.removeEventListener('mouseup', onmouseup, true);
                    document.body.style.cursor = '';
                    window.dispatchEvent(new Event('split'));
                    onresize();
                };
                document.body.style.cursor = 'col-resize';
                document.addEventListener('mouseup', onmouseup, true);
                document.addEventListener('mousemove', onmousemove, true);
                e.preventDefault();
                e.stopPropagation();
            }, true);

            this.splitter.v = div;
        }
    }
}

class TableView extends View
{
    constructor() {
        if (0 < arguments.length) {
            super(arguments[0]);
        }
        else {
            var element = document.createElement('table');
            element.classList.add('dataset');
            super(element);
        }
    }

    set columns(src) {
        var table = this.element.createTHead();
        var row = table.insertRow();
        var cell = row.insertCell();
        cell.textContent = ' ';
        for (var c = 0; c < src.length; ++c) {
            cell = row.insertCell();
            cell.textContent = src[c];
        }
    }

    set data(src) {
        var table = this.element.createTBody();
        for (var r = 1000 < src.length ? src.length - 1000 : 0; r < src.length; ++r) {
            var row = table.insertRow();
            var cell = row.insertCell();
            cell.textContent = r + 1;
            for (var c = 0; c < src[r].length; ++c) {
                cell = row.insertCell();
                var value = src[r][c];
                cell.textContent = value;
                if (null == value) {
                    cell.classList.add('null');
                }
            }
        }
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
            element.classList.add('item');
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
            element.classList.add('item');
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
            element.classList.add('item');

            var label = document.createElement('div');
            label.classList.add('label');
            element.appendChild(label);

            var led = document.createElement('span');
            led.classList.add('led');
            label.appendChild(led);

            var caption = document.createElement('span');
            caption.classList.add('lvi-caption');
            label.appendChild(caption);

            var info = document.createElement('div');
            info.classList.add('info');
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
        var element = this.element.querySelector('.info');
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
        if (1 != this.maxCount && -1 == this.selectedIndex && this.autoScroll) {
            item.element.scrollIntoView({behavior: 'instant'});
        }
        window.setTimeout(function() {
            window.dispatchEvent(new Event('split'));
        });
    }

    clear() {
        this.selectedIndex = -1;
        this.element.innerHTML = '';
        window.setTimeout(function() {
            window.dispatchEvent(new Event('split'));
        });
    }

    onItemClick(e) {
        if (-1 != this.selectedIndex) {
            this.element.children[this.selectedIndex].classList.remove('selected');
        }
        if (1 != this.maxCount) {
            this.selectedIndex = e.currentTarget.itemIndex;
            e.currentTarget.classList.add('selected');
            e.stopPropagation();
        }
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

