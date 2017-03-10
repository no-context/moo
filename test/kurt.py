# Copyright (C) 2012 Tim Radvan
#
# This file is part of Kurt.
#
# Kurt is free software: you can redistribute it and/or modify it under the
# terms of the GNU Lesser General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option) any
# later version.
#
# Kurt is distributed in the hope that it will be useful, but WITHOUT ANY
# WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
# A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more
# details.
#
# You should have received a copy of the GNU Lesser General Public License
# along with Kurt. If not, see <http://www.gnu.org/licenses/>.

"""
A Python module for reading and writing Scratch project files.

Scratch is created by the Lifelong Kindergarten Group at the MIT Media Lab.
See their website: http://scratch.mit.edu/


Classes
-------

The main interface:

* :class:`Project`

The following :class:`Actors <Actor>` may be found on the project stage:

* :class:`Stage`
* :class:`Sprite`
* :class:`Watcher`

The two :class:`Scriptables <Scriptable>` (:class:`Stage` and :class:`Sprite`)
have instances of the following contained in their attributes:

* :class:`Variable`
* :class:`List`

Scripts use the following classes:

* :class:`Block`
* :class:`Script`
* :class:`Comment`
* :class:`BlockType`

Media files use the following classes:

* :class:`Costume`
* :class:`Image`
* :class:`Sound`
* :class:`Waveform`

File Formats
------------

Supported file formats:

    =============== =========== =========
    Format Name     Description Extension
    =============== =========== =========
    ``"scratch14"`` Scratch 1.4 ``.sb``
    ``"scratch20"`` Scratch 2.0 ``.sb2``
    =============== =========== =========

Pass "Format name" as the argument to :attr:`Project.convert`.

Kurt provides a superset of the information in each individual format, but will
only convert features between a subset of formats.

----

"""

__version__ = '2.0.7'

from collections import OrderedDict
import re
import os
import random
try:
    from cStringIO import StringIO
except ImportError:
    from StringIO import StringIO

import PIL.Image
import wave



#-- Utils --#

def _clean_filename(name):
    """Strip non-alphanumeric characters to makes name safe to be used as
    filename."""
    return re.sub("[^\\w .]", "", name)



#-- Project: main class --#

class Project(object):
    """The main kurt class. Stores the contents of a project file.

    Contents include global variables and lists, the :attr:`stage` and
    :attr:`sprites`, each with their own :attr:`scripts`, :attr:`costumes`,
    :attr:`sounds`, :attr:`variables` and :attr:`lists`.

    A Project can be loaded from or saved to disk in a format which can be read
    by a Scratch program or one of its derivatives.

    Loading a project::

        p = kurt.Project.load("tests/game.sb")

    Getting all the scripts::

        for scriptable in p.sprites + [p.stage]:
            for script in scriptable.scripts:
                print script

    Creating a new project::

        p = kurt.Project()

    Converting between formats::

        p = kurt.Project.load("tests/game.sb")
        p.convert("scratch20")
        # []
        p.save()
        # 'tests/game.sb2'

    """

    def __init__(self):
        self.name = u""
        """The name of the project.

        May be displayed to the user. Doesn't have to match the filename in
        :attr:`path`. May not be saved for some formats.

        """

        self.path = None
        """The path to the project file."""

        self._plugin = None
        """The file format plugin used to load this project.

        Get the current format using the :attr:`format` property. Use
        :attr:`convert()` to change between formats.

        """

        self.stage = Stage(self)
        """The :class:`Stage`."""

        self.sprites = []
        """List of :class:`Sprites <Sprite>`.

        Use :attr:`get_sprite` to get a sprite by name.

        """

        self.actors = []
        """List of each :class:`Actor` on the stage.

        Includes :class:`Watchers <Watcher>` as well as :class:`Sprites
        <Sprite>`.

        Sprites in :attr:`sprites` but not in actors will be added to actors on
        save.

        """

        self.variables = {}
        """:class:`dict` of global :class:`Variables <Variable>` by name."""

        self.lists = {}
        """:class:`dict` of global :class:`Lists <List>` by name."""

        self.thumbnail = None
        """An :class:`Image` with a screenshot of the project."""

        self.tempo = 60
        """The tempo in BPM used for note blocks."""

        self.notes = u"Made with Kurt\nhttp://github.com/blob8108/kurt"
        """Notes about the project, aka project comments.

        Displayed on the website next to the project.

        Line endings will be converted to ``\\n``.

        """

        self.author = u""
        """The username of the project's author, eg. ``'blob8108'``."""

    def __repr__(self):
        return "<%s.%s()>" % (self.__class__.__module__,
                self.__class__.__name__)

    def get_sprite(self, name):
        """Get a sprite from :attr:`sprites` by name.

        Returns None if the sprite isn't found.

        """
        for sprite in self.sprites:
            if sprite.name == name:
                return sprite

    @property
    def format(self):
        """The file format of the project.

        :class:`Project` is mainly a universal representation, and so a project
        has no specfic format. This is the format the project was loaded with.
        To convert to a different format, use :attr:`save()`.

        """
        if self._plugin:
            return self._plugin.name

    @classmethod
    def load(cls, path, format=None):
        """Load project from file.

        Use ``format`` to specify the file format to use.

        Path can be a file-like object, in which case format is required.
        Otherwise, can guess the appropriate format from the extension.

        If you pass a file-like object, you're responsible for closing the
        file.

        :param path:   Path or file pointer.
        :param format: :attr:`KurtFileFormat.name` eg. ``"scratch14"``.
                       Overrides the extension.

        :raises: :class:`UnknownFormat` if the extension is unrecognised.
        :raises: :py:class:`ValueError` if the format doesn't exist.

        """
        path_was_string = isinstance(path, basestring)
        if path_was_string:
            (folder, filename) = os.path.split(path)
            (name, extension) = os.path.splitext(filename)
            if format is None:
                plugin = kurt.plugin.Kurt.get_plugin(extension=extension)
                if not plugin:
                    raise UnknownFormat(extension)
            fp = open(path, "rb")
        else:
            fp = path
            assert format, "Format is required"
            plugin = kurt.plugin.Kurt.get_plugin(format)

        if not plugin:
            raise ValueError, "Unknown format %r" % format

        project = plugin.load(fp)
        if path_was_string:
            fp.close()
        project.convert(plugin)
        if isinstance(path, basestring):
            project.path = path
            if not project.name:
                project.name = name
        return project

    def copy(self):
        """Return a new Project instance, deep-copying all the attributes."""
        p = Project()
        p.name = self.name
        p.path = self.path
        p._plugin = self._plugin
        p.stage = self.stage.copy()
        p.stage.project = p

        for sprite in self.sprites:
            s = sprite.copy()
            s.project = p
            p.sprites.append(s)

        for actor in self.actors:
            if isinstance(actor, Sprite):
                p.actors.append(p.get_sprite(actor.name))
            else:
                a = actor.copy()
                if isinstance(a, Watcher):
                    if isinstance(a.target, Project):
                        a.target = p
                    elif isinstance(a.target, Stage):
                        a.target = p.stage
                    else:
                        a.target = p.get_sprite(a.target.name)
                p.actors.append(a)

        p.variables = dict((n, v.copy()) for (n, v) in self.variables.items())
        p.lists = dict((n, l.copy()) for (n, l) in self.lists.items())
        p.thumbnail = self.thumbnail
        p.tempo = self.tempo
        p.notes = self.notes
        p.author = self.author
        return p

    def convert(self, format):
        """Convert the project in-place to a different file format.

        Returns a list of :class:`UnsupportedFeature` objects, which may give
        warnings about the conversion.

        :param format: :attr:`KurtFileFormat.name` eg. ``"scratch14"``.

        :raises: :class:`ValueError` if the format doesn't exist.

        """
        self._plugin = kurt.plugin.Kurt.get_plugin(format)
        return list(self._normalize())

    def save(self, path=None, debug=False):
        """Save project to file.

        :param path: Path or file pointer.

                     If you pass a file pointer, you're responsible for closing
                     it.

                     If path is not given, the :attr:`path` attribute is used,
                     usually the original path given to :attr:`load()`.

                     If `path` has the extension of an existing plugin, the
                     project will be converted using :attr:`convert`.
                     Otherwise, the extension will be replaced with the
                     extension of the current plugin.

                     (Note that log output for the conversion will be printed
                     to stdout. If you want to deal with the output, call
                     :attr:`convert` directly.)

                     If the path ends in a folder instead of a file, the
                     filename is based on the project's :attr:`name`.

        :param debug: If true, return debugging information from the format
                      plugin instead of the path.

        :raises: :py:class:`ValueError` if there's no path or name.

        :returns: path to the saved file.

        """

        p = self.copy()
        plugin = p._plugin

        # require path
        p.path = path or self.path
        if not p.path:
            raise ValueError, "path is required"

        if isinstance(p.path, basestring):
            # split path
            (folder, filename) = os.path.split(p.path)
            (name, extension) = os.path.splitext(filename)

            # get plugin from extension
            if path: # only if not using self.path
                try:
                    plugin = kurt.plugin.Kurt.get_plugin(extension=extension)
                except ValueError:
                    pass

            # build output path
            if not name:
                name = _clean_filename(self.name)
                if not name:
                    raise ValueError, "name is required"
            filename = name + plugin.extension
            p.path = os.path.join(folder, filename)

            # open
            fp = open(p.path, "wb")
        else:
            fp = p.path
            path = None

        if not plugin:
            raise ValueError, "must convert project to a format before saving"

        for m in p.convert(plugin):
            print m
        result = p._save(fp)
        if path:
            fp.close()
        return result if debug else p.path

    def _save(self, fp):
        return self._plugin.save(fp, self)

    def _normalize(self):
        """Convert the project to a standardised form for the current plugin.

        Called after loading, before saving, and when converting to a new
        format.

        Yields UnsupportedFeature instances.

        """

        unique_sprite_names = set(sprite.name for sprite in self.sprites)
        if len(unique_sprite_names) < len(self.sprites):
            raise ValueError, "Sprite names must be unique"

        # sync self.sprites and self.actors
        for sprite in self.sprites:
            if sprite not in self.actors:
                self.actors.append(sprite)
        for actor in self.actors:
            if isinstance(actor, Sprite):
                if actor not in self.sprites:
                    raise ValueError, \
                        "Can't have sprite on stage that isn't in sprites"

        # normalize Scriptables
        self.stage._normalize()
        for sprite in self.sprites:
            sprite._normalize()

        # normalize actors
        for actor in self.actors:
            if not isinstance(actor, Scriptable):
                actor._normalize()

        # make Watchers if needed
        for thing in [self, self.stage] + self.sprites:
            for (name, var) in thing.variables.items():
                if not var.watcher:
                    var.watcher = kurt.Watcher(thing,
                            kurt.Block("var", name), is_visible=False)
                    self.actors.append(var.watcher)
            for (name, list_) in thing.lists.items():
                if not list_.watcher:
                    list_.watcher = kurt.Watcher(thing,
                            kurt.Block("list", name), is_visible=False)
                    self.actors.append(list_.watcher)

        # notes - line endings
        self.notes = self.notes.replace("\r\n", "\n").replace("\r", "\n")

        # convert scripts
        def convert_block(block):
            # convert block
            try:
                if isinstance(block.type, CustomBlockType):
                    if "Custom Blocks" not in self._plugin.features:
                        raise BlockNotSupported(
                                "%s doesn't support custom blocks"
                                % self._plugin.display_name)

                else: # BlockType
                    pbt = block.type.convert(self._plugin)
            except BlockNotSupported, err:
                err.message += ". Caused by: %r" % block
                err.block = block
                err.scriptable = scriptable
                err.args = (err.message,)
                if getattr(block.type, '_workaround', None):
                    block = block.type._workaround(block)
                    if not block:
                        raise
                else:
                    raise

            # convert args
            args = []
            for arg in block.args:
                if isinstance(arg, Block):
                    arg = convert_block(arg)
                elif isinstance(arg, list):
                    arg = map(convert_block, arg)
                args.append(arg)
            block.args = args

            return block

        for scriptable in [self.stage] + self.sprites:
            for script in scriptable.scripts:
                if isinstance(script, Script):
                    script.blocks = map(convert_block, script.blocks)

        # workaround unsupported features
        for feature in kurt.plugin.Feature.FEATURES.values():
            if feature not in self._plugin.features:
                for x in feature.workaround(self):
                    yield UnsupportedFeature(feature, x)

        # normalize supported features
        for feature in self._plugin.features:
            feature.normalize(self)

    def get_broadcasts(self):
        def get_broadcasts(block):
            for (arg, insert) in zip(block.args, block.type.inserts):
                if isinstance(arg, Block):
                    for b in get_broadcasts(arg):
                        yield b
                elif isinstance(arg, list):
                    for arg_block in arg:
                        for b in get_broadcasts(arg_block):
                            yield b
                elif insert.kind == "broadcast":
                    yield arg

        for scriptable in [self.stage] + self.sprites:
            for script in scriptable.scripts:
                for block in script.blocks:
                    for b in get_broadcasts(block):
                        yield b


class UnsupportedFeature(object):
    """The plugin doesn't support this Feature.

    Output once by Project.convert for each occurence of the feature.

    """
    def __init__(self, feature, obj):
        self.feature = kurt.plugin.Feature.get(feature)
        self.obj = obj

    def __repr__(self):
        return "<%s.%s(%s)>" % (self.__class__.__module__,
                self.__class__.__name__, unicode(self))

    def __str__(self):
        return "UnsupportedFeature: %s" % unicode(self)

    def __unicode__(self):
        return u"%r: %r" % (self.feature.name, self.obj)



#-- Errors --#

class UnknownFormat(Exception):
    """The file extension is not recognised.

    Raised when :class:`Project` can't find a valid format plugin to handle the
    file extension.

    """
    pass


class UnknownBlock(Exception):
    """A :class:`Block` with the given command or type cannot be found.

    Raised by :attr:`BlockType.get`.

    """


class BlockNotSupported(Exception):
    """The plugin doesn't support this Block.

    Raised by :attr:`Block.convert` when it can't find a
    :class:`PluginBlockType` for the given plugin.

    """
    pass


class VectorImageError(Exception):
    """Tried to construct a raster image from a vector format image file.

    You shouldn't usally get this error, because Feature("Vector Images") will
    give a warning instead when the Project is converted.

    """
    pass



#-- Actors & Scriptables --#

class Actor(object):
    """An object that goes on the project stage.

    Subclasses include :class:`Watcher` or :class:`Sprite`.

    """


class Scriptable(object):
    """Superclass for all scriptable objects.

    Subclasses are :class:`Stage` and :class:`Sprite`.

    """

    def __init__(self, project):
        self.project = project
        """The :class:`Project` this belongs to."""

        self.scripts = []
        """The contents of the scripting area.

        List containing :class:`Scripts <Script>` and :class:`Comments
        <Comment>`.

        Will be sorted by y position on load/save.

        """

        self.custom_blocks = {}
        """Scripts for custom blocks, indexed by :class:`CustomBlockType`."""

        self.variables = {}
        """:class:`dict` of :class:`Variables <Variable>` by name."""

        self.lists = {}
        """:class:`dict` of :class:`Lists <List>` by name."""

        self.costumes = []
        """List of :class:`Costumes <Costume>`."""

        self.sounds = []
        """List of :class:`Sounds <Sound>`."""

        self.costume = None
        """The currently selected :class:`Costume`.

        Defaults to the first costume in :attr:`self.costumes` on save.

        If a sprite doesn't have a costume, a black 1x1 pixel square will be
        used.

        """

        self.volume = 100
        """The volume in percent used for note and sound blocks."""

    def _normalize(self):
        # costumes
        if self.costume:
            # Make sure it's in costumes
            if self.costume not in self.costumes:
                self.costumes.append(self.costume)
        else:
            # No costume!
            if self.costumes:
                self.costume = self.costumes[0]
            else:
                BLACK = (0, 0, 0)
                self.costume = Costume("blank", Image.new((1, 1), BLACK))
                self.costumes = [self.costume]

        # scripts
        for script in self.scripts:
            script._normalize()

        # sort scripts by y position
        have_position = [s for s in self.scripts if s.pos]
        no_position = [s for s in self.scripts if not s.pos]
        have_position.sort(key=lambda s: (s.pos[1], s.pos[0]))
        self.scripts = have_position + no_position

    def copy(self, o=None):
        """Return a new instance, deep-copying all the attributes."""
        if o is None: o = self.__class__(self.project)
        o.scripts = [s.copy() for s in self.scripts]
        o.variables = dict((n, v.copy()) for (n, v) in self.variables.items())
        o.lists = dict((n, l.copy()) for (n, l) in self.lists.items())
        o.costumes = [c.copy() for c in self.costumes]
        o.sounds = [s.copy() for s in self.sounds]
        o.costume_index = self.costume_index
        o.volume = self.volume
        return o

    @property
    def costume_index(self):
        """The index of :attr:`costume` in :attr:`costumes`.

        None if no costume is selected.

        """
        if self.costume:
            return self.costumes.index(self.costume)

    @costume_index.setter
    def costume_index(self, index):
        if index is None:
            self.costume = None
        else:
            self.costume = self.costumes[index]

    def parse(self, text):
        """Parse the given code and add it to :attr:`scripts`.

        The syntax matches :attr:`Script.stringify()`. See :mod:`kurt.text` for
        reference.

        """
        self.scripts.append(kurt.text.parse(text, self))


class Stage(Scriptable):
    """Represents the background of the project. The stage is similar to a
    :class:`Sprite`, but has a fixed position. The stage has a fixed size of
    ``480x360`` pixels.

    The stage does not require a costume. If none is given, it is assumed to be
    white (#FFF).

    Not all formats have stage-specific variables and lists. Global variables
    and lists are stored on the :class:`Project`.

    :param project: The :class:`Project` this Stage belongs to.
                    Note that you still need to set :attr:`Project.stage` to
                    this Stage instance.

    """

    name = "Stage"
    is_draggable = False
    is_visible = True

    SIZE = (480, 360)
    COLOR = (255, 255, 255)

    def __init__(self, project):
        Scriptable.__init__(self, project)

    @property
    def backgrounds(self):
        """Alias for :attr:`costumes`."""
        return self.costumes

    @backgrounds.setter
    def backgrounds(self, value):
        self.costumes = value

    def __repr__(self):
        return "<%s.%s()>" % (self.__class__.__module__,
                self.__class__.__name__)

    def _normalize(self):
        if not self.costume and not self.costumes:
            self.costume = Costume("blank", Image.new(self.SIZE, self.COLOR))
        Scriptable._normalize(self)


class Sprite(Scriptable, Actor):
    """A scriptable object displayed on the project stage. Can be moved and
    rotated, unlike the :class:`Stage`.

    Sprites require a :attr:`costume`, and will raise an error when saving
    without one.

    :param project: The :class:`Project` this Sprite belongs to.
                    Note that you still need to add this sprite to
                    :attr:`Project.sprites`.

    """

    def __init__(self, project, name):
        Scriptable.__init__(self, project)

        self.name = unicode(name)
        """The name of the sprite, as referred to from scripts and displayed in
        the Scratch interface.

        """

        self.position = (0, 0)
        """The ``(x, y)`` position of the centre of the sprite in Scratch
        co-ordinates.

        """

        self.direction = 90.0
        """The angle in degrees the sprite is rotated to."""

        self.rotation_style = "normal"
        """How the sprite's costume rotates with the sprite. Valid values are:

        ``'normal'``
            Continuous rotation with :attr:`direction`. The default.

        ``'leftRight'``
            Don't rotate. Instead, flip the costume for directions with x
            component < 0. Useful for side-views.

        ``'none'``
            Don't rotate with direction.

        """

        self.size = 100.0
        """The scale factor of the sprite in percent. Defaults to 100."""

        self.is_draggable = False
        """True if the sprite can be dragged using the mouse in the
        player/presentation mode.

        """

        self.is_visible = True
        """Whether the sprite is shown on the stage. False if the sprite is
        hidden.

        """

    def _normalize(self):
        Scriptable._normalize(self)
        assert self.rotation_style in ("normal", "leftRight", "none")

    def copy(self):
        """Return a new instance, deep-copying all the attributes."""
        o = self.__class__(self.project, self.name)
        Scriptable.copy(self, o)
        o.position = tuple(self.position)
        o.direction = self.direction
        o.rotation_style = self.rotation_style
        o.size = self.size
        o.is_draggable = self.is_draggable
        o.is_visible = self.is_visible
        return o

    def __repr__(self):
        return "<%s.%s(%r)>" % (self.__class__.__module__,
                self.__class__.__name__, self.name)


class Watcher(Actor):
    """A monitor for displaying a data value on the stage.

    Some formats won't save hidden watchers, and so their position won't be
    remembered.

    """

    def __init__(self, target, block, style="normal", is_visible=True,
            pos=None):
        Actor.__init__(self)

        assert target is not None
        self.target = target
        """The :attr:`Scriptable` or :attr:`Project` the watcher belongs to.

        """

        self.block = block
        """The :attr:`Block` to evaluate on :attr:`target`.

        For variables::

            kurt.Block('readVariable', 'variable name')

        For lists::

            kurt.Block('contentsOfList:', 'list name')

        """

        self.style = str(style)
        """How the watcher should appear.

        Valid values:

        ``'normal'``
            The name of the data is displayed next to its value. The only
            valid value for list watchers.

        ``'large'``
            The data is displayed in a larger font with no describing text.

        ``'slider'``
            Like the normal style, but displayed with a slider that can change
            the variable's value. Not valid for reporter block watchers.

        """

        self.pos = pos
        """``(x, y)`` position of the top-left of the watcher from the top-left
        of the stage in pixels. None if not specified.

        """

        self.is_visible = bool(is_visible)
        """Whether the watcher is displayed on the screen.

        Some formats won't save hidden watchers, and so their position won't be
        remembered.

        """

        self.slider_min = 0
        """Minimum value for slider. Only applies to ``"slider"`` style."""

        self.slider_max = 100
        """Maximum value for slider. Only applies to ``"slider"`` style."""

        self._normalize()

    def _normalize(self):
        assert self.style in ("normal", "large", "slider")
        if self.value:
            self.value.watcher = self

    def copy(self):
        """Return a new instance with the same attributes."""
        o = self.__class__(self.target,
                self.block.copy(),
                self.style,
                self.is_visible,
                self.pos)
        o.slider_min = self.slider_min
        o.slider_max = self.slider_max
        return o

    @property
    def kind(self):
        """The type of value to watch, based on :attr:`block`.

        One of ``variable``, ``list``, or ``block``.

        ``block`` watchers watch the value of a reporter block.

        """
        if self.block.type.has_command('readVariable'):
            return 'variable'
        elif self.block.type.has_command('contentsOfList:'):
            return 'list'
        else:
            return 'block'

    @property
    def value(self):
        """Return the :class:`Variable` or :class:`List` to watch.

        Returns ``None`` if it's a block watcher.

        """
        if self.kind == 'variable':
            return self.target.variables[self.block.args[0]]
        elif self.kind == 'list':
            return self.target.lists[self.block.args[0]]

    def __repr__(self):
        r = "%s.%s(%r, %r" % (self.__class__.__module__,
                self.__class__.__name__, self.target, self.block)
        if self.style != "normal":
            r += ", style=%r" % self.style
        if not self.is_visible:
            r += ", is_visible=False"
        if self.pos:
            r += ", pos=%s" % repr(self.pos)
        r += ")"
        return r



#-- Variables --#

class Variable(object):
    """A memory value used in scripts.

    There are both :attr:`global variables <Project.variables>` and
    :attr:`sprite-specific variables <Sprite.variables>`.

    Some formats also have :attr:`stage-specific variables <Stage.variables>`.

    """

    def __init__(self, value=0, is_cloud=False):
        self.value = value
        """The value of the variable, usually a number or a string.

        For some formats, variables can take list values, and :class:`List` is
        not used.

        """

        self.is_cloud = bool(is_cloud)
        """Whether the value of the variable is shared with other users.

        For Scratch 2.0.

        """

        self.watcher = None
        """The :class:`Watcher` instance displaying this Variable's value."""

    def copy(self):
        """Return a new instance with the same attributes."""
        return self.__class__(self.value, self.is_cloud)

    def __repr__(self):
        r = "%s.%s(%r" % (self.__class__.__module__, self.__class__.__name__,
                self.value)
        if self.is_cloud:
            r += ", is_cloud=%r" % self.is_cloud
        r += ")"
        return r


class List(object):
    """A sequence of items used in scripts.

    Each item takes a :class:`Variable`-like value.

    Lists cannot be nested. However, for some formats, variables can take
    list values, and this class is not used.

    """
    def __init__(self, items=None, is_cloud=False):
        self.items = list(items) if items else []
        """The items contained in the list. A Python list of unicode
        strings.

        """

        self.is_cloud = bool(is_cloud)
        """Whether the value of the list is shared with other users.

        For Scratch 2.0.

        """

        self.watcher = None
        """The :class:`Watcher` instance displaying this List's value."""

        self._normalize()

    def _normalize(self):
        self.items = map(unicode, self.items)

    def copy(self):
        """Return a new instance with the same attributes."""
        return self.__class__(self.items, self.is_cloud)

    def __repr__(self):
        r = "<%s.%s(%i items)>" % (self.__class__.__module__,
                self.__class__.__name__, len(self.items))
        if self.is_cloud:
            r += ", is_cloud=%r" % self.is_cloud
        r += ")"
        return r



#-- Color --#

class Color(object):
    """A 24-bit RGB color value.

    Accepts tuple or hexcode arguments::

        >>> kurt.Color('#f08')
        kurt.Color(255, 0, 136)

        >>> kurt.Color((255, 0, 136))
        kurt.Color(255, 0, 136)

        >>> kurt.Color('#f0ffee')
        kurt.Color(240, 255, 238)

    """

    def __init__(self, r, g=None, b=None):
        if g is None and b is None:
            if isinstance(r, Color):
                r = r.value
            elif isinstance(r, basestring):
                if not r.startswith("#"):
                    raise ValueError, "invalid color hexcode: %r" % r
                r = r[1:]
                if len(r) == 3:
                    r = r[0] + r[0] + r[1] + r[1] + r[2] + r[2]
                split = (r[0:2], r[2:4], r[4:6])
                r = [int(x, 16) for x in split]
            (r, g, b) = r

        self.r = int(r)
        """Red component, 0-255"""

        self.g = int(g)
        """Green component, 0-255"""

        self.b = int(b)
        """Blue component, 0-255"""

    @property
    def value(self):
        """Return ``(r, g, b)`` tuple."""
        return (self.r, self.g, self.b)

    @value.setter
    def value(self, value):
        (self.r, self.g, self.b) = value

    def __eq__(self, other):
        return isinstance(other, Color) and self.value == other.value

    def __ne__(self, other):
        return not self == other

    def __iter__(self):
        return iter(self.value)

    def __repr__(self):
        return "%s.%s(%s)" % (self.__class__.__module__,
                self.__class__.__name__, repr(self.value).strip("()"))

    def stringify(self):
        """Returns the color value in hexcode format.

        eg. ``'#ff1056'``

        """
        hexcode = "#"
        for x in self.value:
            part = hex(x)[2:]
            if len(part) < 2: part = "0" + part
            hexcode += part
        return hexcode

    @classmethod
    def random(cls):
        f = lambda: random.randint(0, 255)
        return cls(f(), f(), f())



#-- BlockTypes --#

class Insert(object):
    """The specification for an argument to a :class:`BlockType`."""

    SHAPE_DEFAULTS = {
        'number': 0,
        'number-menu': 0,
        'stack': [],
        'color': Color('#f00'),
        'inline': 'nil', # Can't be empty
    }

    SHAPE_FMTS = {
        'number': '(%s)',
        'string': '[%s]',
        'readonly-menu': '[%s v]',
        'number-menu': '(%s v)',
        'color': '[%s]',
        'boolean': '<%s>',
        'stack': '\n    %s\n',
        'inline': '%s',
        'block': '{%s}',
    }

    KIND_OPTIONS = {
        'attribute': ['x position', 'y position', 'direction', 'costume #',
            'size', 'volume'],
        'backdrop': [],
        'booleanSensor': ['button pressed', 'A connected', 'B connected',
            'C connected', 'D connected'],
        'broadcast': [],
        'costume': [],
        'direction': [],
        'drum': range(1, 18),
        'effect': ['color', 'fisheye', 'whirl', 'pixelate', 'mosaic',
            'brightness', 'ghost'],
        'instrument': range(1, 21),
        'key': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b',
            'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
            'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'space',
            'left arrow', 'right arrow', 'up arrow', 'down arrow'],
        'list': [],
        'listDeleteItem': ['last', 'all'],
        'listItem': ['last', 'random'],
        'mathOp': ['abs', 'floor', 'ceiling', 'sqrt', 'sin', 'cos', 'tan',
            'asin', 'acos', 'atan', 'ln', 'log', 'e ^', '10 ^'],
        'motorDirection': ['this way', 'that way', 'reverse'],
        'note': [],
        'rotationStyle': ['left-right', "don't rotate", 'all around'],
        'sensor': ['slider', 'light', 'sound', 'resistance-A', 'resistance-B',
            'resistance-C', 'resistance-D'],
        'sound': [],
        'spriteOnly': ['myself'],
        'spriteOrMouse': ['mouse-pointer'],
        'spriteOrStage': ['Stage'],
        'stageOrThis': ['Stage'], # ? TODO
        'stop': ['all', 'this script', 'other scripts in sprite'],
        'timeAndDate': ['year', 'month', 'date', 'day of week', 'hour',
            'minute', 'second'],
        'touching': ['mouse-pointer', 'edge'],
        'triggerSensor': ['loudness', 'timer', 'video motion'],
        'var': [],
        'videoMotionType': ['motion', 'direction'],
        'videoState': ['off', 'on', 'on-flipped'],
    }

    def __init__(self, shape, kind=None, default=None, name=None,
            unevaluated=None):
        self.shape = shape
        """What kind of values this argument accepts.

        Shapes that accept a simple data value or a reporter block:

        ``'number'``
            An integer or float number. Defaults to ``0``.

        ``'string'``
            A unicode text value.

        ``'readonly-menu'``
            A choice of string value from a menu.

            Some readonly inserts do not accept reporter blocks.

        ``'number-menu'``
            Either a number value, or a choice of special value from a menu.

            Defaults to ``0``.

        ``'color'``
            A :class:`Color` value. Defaults to a random color.

        Shapes that only accept blocks with the corresponding :attr:`shape`:

        ``'boolean'``
            Accepts a boolean block.

        ``'stack'``
            Accepts a list of stack blocks. Defaults to ``[]``.

            The block is rendered with a "mouth" into which blocks can be
            inserted.

        Special shapes:

        ``'inline'``
            Not actually an insert -- used for variable and list reporters.

        ``'block'``
            Used for the argument to the "define ..." hat block.

        """

        self.kind = kind
        """Valid arguments for a "menu"-shaped insert. Default is ``None``.

        Valid values include:

        * ``'attribute'``
        * ``'booleanSensor'``
        * ``'broadcast'``
        * ``'costume'``
        * ``'direction'``
        * ``'drum'``
        * ``'effect'``
        * ``'instrument'``
        * ``'key'``
        * ``'list'``
        * ``'listDeleteItem'``
        * ``'listItem'``
        * ``'mathOp'``
        * ``'motorDirection'``
        * ``'note'``
        * ``'sensor'``
        * ``'sound'``
        * ``'spriteOrMouse'``
        * ``'spriteOrStage'``
        * ``'touching'``
        * ``'var'``

        Scratch 2.0-specific:

        * ``'backdrop'``
        * ``'rotationStyle'``
        * ``'spriteOnly'``
        * ``'stageOrThis'``
        * ``'stop'``
        * ``'timeAndDate'``
        * ``'triggerSensor'``
        * ``'videoMotionType'``
        * ``'videoState'``

        """

        self.default = default or Insert.SHAPE_DEFAULTS.get(shape, None)
        """The default value for the insert."""

        if unevaluated is None:
            unevaluated = True if shape == 'stack' else False
        self.unevaluated = unevaluated
        """True if the interpreter should evaluate the argument to the block.

        Defaults to True for 'stack' inserts, False for all others.

        """

        self.name = name
        """The name of the parameter to a :class:`CustomBlockType`.

        Not used for :class:`BlockTypes <BlockType>`.

        """

    def __repr__(self):
        r = "%s.%s(%r" % (self.__class__.__module__,
                self.__class__.__name__, self.shape)
        if self.kind != None:
            r += ", %r" % self.kind
        if self.default != Insert.SHAPE_DEFAULTS.get(self.shape, None):
            r += ", default=%r" % self.default
        if self.unevaluated:
            r += ", unevaluated=%r" % self.unevaluated
        if self.name:
            r += ", name=%r" % self.name
        r += ")"
        return r

    def __eq__(self, other):
        if isinstance(other, Insert):
            for name in ("shape", "kind", "default", "unevaluated"):
                if getattr(self, name) != getattr(other, name):
                    return False
            else:
                return True

    def __ne__(self, other):
        return not self == other

    def copy(self):
        return Insert(self.shape, self.kind, self.default, self.name,
                      self.unevaluated)

    def stringify(self, value=None, block_plugin=False):
        if value is None or (value is False and self.shape == "boolean"):
            value = self.default
            if value is None:
                value = ""
        if isinstance(value, Block): # use block's shape
            return value.stringify(block_plugin, in_insert=True)
        else:
            if hasattr(value, "stringify"):
                value = value.stringify()
            elif isinstance(value, list):
                value = "\n".join(block.stringify(block_plugin) for block in value)

            if self.shape == 'stack':
                value = value.replace("\n", "\n    ")

            if block_plugin or self.shape in 'stack':
                value = Insert.SHAPE_FMTS.get(self.shape, '%s') % (value,)
            elif self.shape == 'string' or self.kind == 'broadcast':
                value = unicode(value)
                if "'" in value:
                    value = '"%s"' % value.replace('"', '\\"')
                else:
                    value = "'%s'" % value.replace("'", "\\'")
            return value

    def options(self, scriptable=None):
        """Return a list of valid options to a menu insert, given a
        Scriptable for context.

        Mostly complete, excepting 'attribute'.

        """
        options = list(Insert.KIND_OPTIONS.get(self.kind, []))
        if scriptable:
            if self.kind == 'var':
                options += scriptable.variables.keys()
                options += scriptable.project.variables.keys()
            elif self.kind == 'list':
                options += scriptable.lists.keys()
                options += scriptable.project.lists.keys()
            elif self.kind == 'costume':
                options += [c.name for c in scriptable.costumes]
            elif self.kind == 'backdrop':
                options += [c.name for c in scriptable.project.stage.costumes]
            elif self.kind == 'sound':
                options += [c.name for c in scriptable.sounds]
                options += [c.name for c in scriptable.project.stage.sounds]
            elif self.kind in ('spriteOnly', 'spriteOrMouse', 'spriteOrStage',
                    'touching'):
                options += [s.name for s in scriptable.project.sprites]
            elif self.kind == 'attribute':
                pass # TODO
            elif self.kind == 'broadcast':
                options += list(set(scriptable.project.get_broadcasts()))
        return options


class BaseBlockType(object):
    """Base for :class:`BlockType` and :class:`PluginBlockType`.

    Defines common attributes.

    """

    SHAPE_FMTS = {
        'reporter': '(%s)',
        'boolean': '<%s>',
    }

    def __init__(self, shape, parts):
        self.shape = shape
        """The shape of the block. Valid values:

        ``'stack'``
            The default. Can connect to blocks above and below. Appear
            jigsaw-shaped.

        ``'cap'``
            Stops the script executing after this block. No blocks can be
            connected below them.

        ``'hat'``
            A block that starts a script, such as by responding to an event.
            Can connect to blocks below.

        ``'reporter'``
            Return a value. Can be placed into insert slots of other blocks as
            an argument to that block. Appear rounded.

        ``'boolean'``
            Like reporter blocks, but return a true/false value. Appear
            hexagonal.

        "C"-shaped blocks with "mouths" for stack blocks, such as ``"doIf"``,
        are specified by adding ``Insert('stack')`` to the end of
        :attr:`parts`.

        """

        self.parts = parts
        """A list describing the text and arguments of the block.

        Contains strings, which are part of the text displayed on the block,
        and :class:`Insert` instances, which are arguments to the block.

        """

    @property
    def text(self):
        """The text displayed on the block.

        String containing ``"%s"`` in place of inserts.

        eg. ``'say %s for %s secs'``

        """
        parts = [("%s" if isinstance(p, Insert) else p) for p in self.parts]
        parts = [("%%" if p == "%" else p) for p in parts] # escape percent
        return "".join(parts)

    @property
    def inserts(self):
        """The type of each argument to the block.

        List of :class:`Insert` instances.

        """
        return [p for p in self.parts if isinstance(p, Insert)]

    @property
    def defaults(self):
        """Default values for block inserts. (See :attr:`Block.args`.)"""
        return [i.default for i in self.inserts]

    @property
    def stripped_text(self):
        """The :attr:`text`, with spaces and inserts removed.

        Used by :class:`BlockType.get` to look up blocks.

        """
        return BaseBlockType._strip_text(
                self.text % tuple((i.default if i.shape == 'inline' else '%s')
                                  for i in self.inserts))

    @staticmethod
    def _strip_text(text):
        """Returns text with spaces and inserts removed."""
        text = re.sub(r'[ ,?:]|%s', "", text.lower())
        for chr in "-%":
            new_text = text.replace(chr, "")
            if new_text:
                text = new_text
        return text.lower()

    def __repr__(self):
        return "<%s.%s(%r shape=%r)>" % (self.__class__.__module__,
                self.__class__.__name__,
                self.text % tuple(i.stringify(None) for i in self.inserts),
                self.shape)

    def stringify(self, args=None, block_plugin=False, in_insert=False):
        if args is None: args = self.defaults
        args = list(args)

        r = self.text % tuple(i.stringify(args.pop(0), block_plugin)
                              for i in self.inserts)
        for insert in self.inserts:
            if insert.shape == 'stack':
                return r + "end"

        fmt = BaseBlockType.SHAPE_FMTS.get(self.shape, "%s")
        if not block_plugin:
            fmt = "%s" if fmt == "%s" else "(%s)"
        if in_insert and fmt == "%s":
            fmt = "{%s}"

        return fmt % r

    def has_insert(self, shape):
        """Returns True if any of the inserts have the given shape."""
        for insert in self.inserts:
            if insert.shape == shape:
                return True
        return False


class BlockType(BaseBlockType):
    """The specification for a type of :class:`Block`.

    These are initialiased by :class:`Kurt` by combining
    :class:`PluginBlockType` objects from individual format plugins to
    create a single :class:`BlockType` for each command.

    """

    def __getstate__(self):
        """lambda functions are not pickleable so drop them."""
        copy = self.__dict__.copy()
        copy['_workaround'] = None
        return copy

    def __init__(self, pbt):
        if isinstance(pbt, basestring):
            raise ValueError("Invalid argument. Did you mean `BlockType.get`?")

        self._plugins = OrderedDict([(pbt.format, pbt)])
        """Stores :class:`PluginBlockType` objects for each plugin name."""

        self._workaround = None

    def _add_conversion(self, plugin, pbt):
        """Add a new PluginBlockType conversion.

        If the plugin already exists, do nothing.

        """
        assert self.shape == pbt.shape
        assert len(self.inserts) == len(pbt.inserts)
        for (i, o) in zip(self.inserts, pbt.inserts):
            assert i.shape == o.shape
            assert i.kind == o.kind
            assert i.unevaluated == o.unevaluated
        if plugin not in self._plugins:
            self._plugins[plugin] = pbt

    def convert(self, plugin=None):
        """Return a :class:`PluginBlockType` for the given plugin name.

        If plugin is ``None``, return the first registered plugin.

        """
        if plugin:
            plugin = kurt.plugin.Kurt.get_plugin(plugin)
            if plugin.name in self._plugins:
                return self._plugins[plugin.name]
            else:
                err = BlockNotSupported("%s doesn't have %r" %
                        (plugin.display_name, self))
                err.block_type = self
                raise err
        else:
            return self.conversions[0]

    @property
    def conversions(self):
        """Return the list of :class:`PluginBlockType` instances."""
        return self._plugins.values()

    def has_conversion(self, plugin):
        """Return True if the plugin supports this block."""
        plugin = kurt.plugin.Kurt.get_plugin(plugin)
        return plugin.name in self._plugins

    def has_command(self, command):
        """Returns True if any of the plugins have the given command."""
        for pbt in self._plugins.values():
            if pbt.command == command:
                return True
        return False

    @property
    def shape(self):
        return self.convert().shape

    @property
    def parts(self):
        return self.convert().parts

    @classmethod
    def get(cls, block_type):
        """Return a :class:`BlockType` instance from the given parameter.

        * If it's already a BlockType instance, return that.

        * If it exactly matches the command on a :class:`PluginBlockType`,
          return the corresponding BlockType.

        * If it loosely matches the text on a PluginBlockType, return the
          corresponding BlockType.

        * If it's a PluginBlockType instance, look for and return the
          corresponding BlockType.

        """
        if isinstance(block_type, (BlockType, CustomBlockType)):
            return block_type

        if isinstance(block_type, PluginBlockType):
            block_type = block_type.command

        block = kurt.plugin.Kurt.block_by_command(block_type)
        if block:
            return block

        blocks = kurt.plugin.Kurt.blocks_by_text(block_type)
        for block in blocks: # check the blocks' commands map to unique blocks
            if kurt.plugin.Kurt.block_by_command(
                    block.convert().command) != blocks[0]:
                raise ValueError(
                        "ambigious block text %r, use one of %r instead" %
                        (block_type, [b.convert().command for b in blocks]))

        if blocks:
            return blocks[0]

        raise UnknownBlock, repr(block_type)

    def __eq__(self, other):
        if isinstance(other, BlockType):
            if self.shape == other.shape and self.inserts == other.inserts:
                for plugin in self._plugins:
                    if plugin in other._plugins:
                        return self._plugins[plugin] == other._plugins[plugin]
        return False

    def __ne__(self, other):
        return not self == other

    def _add_workaround(self, workaround):
        self._workaround = workaround


class PluginBlockType(BaseBlockType):
    """Holds plugin-specific :class:`BlockType` attributes.

    For each block concept, :class:`Kurt` builds a single BlockType that
    references a corresponding PluginBlockType for each plugin that
    supports that block.

    Note that whichever plugin is loaded first takes precedence.

    """

    def __init__(self, category, shape, command, parts, match=None):
        BaseBlockType.__init__(self, shape, parts)

        self.format = None
        """The format plugin the block belongs to."""

        self.command = command
        """The method name from the source code, used to identify the block.

        eg. ``'say:duration:elapsed:from:'``

        """

        self.category = category
        """Where the block is found in the interface.

        The same blocks may have different categories in different formats.

        Possible values include::

            'motion', 'looks', 'sound', 'pen', 'control', 'events', 'sensing',
            'operators', 'data', 'variables', 'list', 'more blocks', 'motor',
            'sensor', 'wedo', 'midi', 'obsolete'

        """

        self._match = match
        """String -- equivalent command from other plugin.

        The plugin containing the command to match against must have been
        registered first.

        """

    def copy(self):
        return self.__class__(self.category, self.shape, self.command,
                              self.parts, self._match)

    def __eq__(self, other):
        if isinstance(other, BlockType):
            if self.shape == other.shape and self.inserts == other.inserts:
                for t in self._plugins:
                    if t in other._plugins:
                        return True
        elif isinstance(other, PluginBlockType):
            for name in ("shape", "inserts", "command", "format", "category"):
                 if getattr(self, name) != getattr(other, name):
                    return False
            else:
                return True
        return False


class CustomBlockType(BaseBlockType):
    """A user-specified :class:`BlockType`.

    The script defining the custom block starts with::

        kurt.Block("procDef", <CustomBlockType>)

    And the scripts definining the block follow.

    The same CustomBlockType instance can then be used in a block in another
    script::

        kurt.Block(<CustomBlocktype>, [args ...,])

    """

    def __init__(self, shape, parts):
        BaseBlockType.__init__(self, shape, parts)

        self.is_atomic = False
        """True if the block should run without screen refresh."""



#-- Scripts --#

class Block(object):
    """A statement in a graphical programming language. Blocks can connect
    together to form sequences of commands, which are stored in a
    :class:`Script`. Blocks perform different commands depending on their
    type.

    :param type:      A :class:`BlockType` instance, used to identify the
                      command the block performs.
                      Will also exact match a :attr:`command` or loosely match
                      :attr:`text`.

    :param ``*args``: List of the block's arguments. Arguments can be numbers,
                      strings, Blocks, or lists of Blocks (for 'stack' shaped
                      Inserts).

    The following constructors are all equivalent::

        >>> block = kurt.Block('say:duration:elapsed:from:', 'Hello!', 2)
        >>> block = kurt.Block('say %s for %s secs', 'Hello!', 2)
        >>> block = kurt.Block('sayforsecs', 'Hello!', 2)

    Using BlockType::

        >>> block.type
        <kurt.BlockType('say [Hello!] for (2) secs', 'stack')>
        >>> block.args
        ['Hello!', 2]
        >>> block2 = kurt.Block(block.type, 'Goodbye!', 5)
        >>> block.stringify()
        'say [Hello!] for (2) secs'
        >>> block2.stringify()
        'say [Goodbye!] for (5) secs'

    """

    def __init__(self, block_type, *args):
        self.type = BlockType.get(block_type)
        """:class:`BlockType` instance. The command this block performs."""

        self.args = []
        """List of arguments to the block.

        The block's parameters are found in :attr:`type.inserts
        <BlockType.inserts>`. Default values come from :attr:`type.defaults
        <BlockType.defaults`.

        """

        self.comment = ""
        """The text of the comment attached to the block. Empty if no comment
        is attached.

        Comments can only be attached to stack blocks.

        """

        if self.type:
            self.args = self.type.defaults[:]

        for i in xrange(len(args)):
            if i < len(self.args):
                self.args[i] = args[i]
            else:
                self.args.append(args[i])

        self._normalize()

    def _normalize(self):
        self.type = BlockType.get(self.type)
        inserts = list(self.type.inserts)
        args = []
        for arg in self.args:
            insert = inserts.pop(0) if inserts else None
            if insert and insert.shape in ('number', 'number-menu'):
                if isinstance(arg, basestring):
                    try:
                        arg = float(arg)
                        arg = int(arg) if int(arg) == arg else arg
                    except ValueError:
                        pass
            args.append(arg)
        self.args = args
        self.comment = unicode(self.comment)

    def copy(self):
        """Return a new Block instance with the same attributes."""
        args = []
        for arg in self.args:
            if isinstance(arg, Block):
                arg = arg.copy()
            elif isinstance(arg, list):
                arg = [b.copy() for b in arg]
            args.append(arg)
        return Block(self.type, *args)

    def __eq__(self, other):
        return (
            isinstance(other, Block) and
            self.type == other.type and
            self.args == other.args
        )

    def __ne__(self, other):
        return not self == other

    def __repr__(self):
        string = "%s.%s(%s, " % (self.__class__.__module__,
                self.__class__.__name__,
                repr(self.type.convert().command if isinstance(self.type,
                    BlockType) else self.type))
        for arg in self.args:
            if isinstance(arg, Block):
                string = string.rstrip("\n")
                string += "\n    %s,\n" % repr(arg).replace("\n", "\n    ")
            elif isinstance(arg, list):
                if string.endswith("\n"):
                    string += "    "
                else:
                    string += " "
                string += "[\n"
                for block in arg:
                    string += "    "
                    string += repr(block).replace("\n", "\n    ")
                    string += ",\n"
                string += "    ], "
            else:
                string += repr(arg) + ", "
        string = string.rstrip(" ").rstrip(",")
        return string + ")"

    def stringify(self, block_plugin=False, in_insert=False):
        s = self.type.stringify(self.args, block_plugin, in_insert)
        if self.comment:
            i = s.index("\n") if "\n" in s else len(s)
            indent = "\n"  +  " " * i  +  " // "
            comment = " // " + self.comment.replace("\n", indent)
            s = s[:i] + comment + s[i:]
        return s


class Script(object):
    """A single sequence of blocks. Each :class:`Scriptable` can have many
    Scripts.

    The first block, ``self.blocks[0]`` is usually a "when" block, eg. an
    EventHatMorph.

    Scripts implement the ``list`` interface, so can be indexed directly, eg.
    ``script[0]``. All other methods like ``append`` also work.

    """

    def __init__(self, blocks=None, pos=None):
        self.blocks = blocks or []
        self.blocks = list(self.blocks)
        """The list of :class:`Blocks <Block>`."""

        self.pos = tuple(pos) if pos else None
        """``(x, y)`` position from the top-left of the script area in
        pixels.

        """

    def _normalize(self):
        self.pos = self.pos
        self.blocks = list(self.blocks)
        for block in self.blocks:
            block._normalize()

    def copy(self):
        """Return a new instance with the same attributes."""
        return self.__class__([b.copy() for b in self.blocks],
                tuple(self.pos) if self.pos else None)

    def __eq__(self, other):
        return (
            isinstance(other, Script) and
            self.blocks == other.blocks
        )

    def __ne__(self, other):
        return not self == other

    def __repr__(self):
        r = "%s.%s([\n" % (self.__class__.__module__,
                self.__class__.__name__)
        for block in self.blocks:
            r += "    " + repr(block).replace("\n", "\n    ") + ",\n"
        r = r.rstrip().rstrip(",") + "]"
        if self.pos:
            r += ", pos=%r" % (self.pos,)
        return r + ")"

    def stringify(self, block_plugin=False):
        return "\n".join(block.stringify(block_plugin)
                         for block in self.blocks)

    # Pretend to be a list

    def __getattr__(self, name):
        if name.startswith('__') and name.endswith('__'):
            return super(Script, self).__getattr__(name)
        return getattr(self.blocks, name)

    def __iter__(self):
        return iter(self.blocks)

    def __len__(self):
        return len(self.blocks)

    def __getitem__(self, index):
        return self.blocks[index]

    def __setitem__(self, index, value):
        self.blocks[index] = value

    def __delitem__(self, index):
        del self.blocks[index]


class Comment(object):
    """A free-floating comment in :attr:`Scriptable.scripts`."""

    def __init__(self, text, pos=None):
        self.text = unicode(text)
        """The text of the comment."""

        self.pos = tuple(pos) if pos else None
        """``(x, y)`` position from the top-left of the script area in
        pixels.

        """

    def copy(self):
        return self.__class__(self.text, tuple(self.pos) if self.pos else None)

    def __repr__(self):
        r = "%s.%s(%r" % (self.__class__.__module__,
                self.__class__.__name__, self.text)
        if self.pos:
            r += ", pos=%r" % (self.pos,)
        return r + ")"

    def stringify(self):
        return "// " + self.text.replace("\n", "\n// ")

    def _normalize(self):
        self.pos = self.pos
        self.text = unicode(self.text)



#-- Costumes --#

class Costume(object):
    """Describes the look of a sprite.

    The raw image data is stored in :attr:`image`.

    """

    def __init__(self, name, image, rotation_center=None):
        self.name = unicode(name)
        """Name used by scripts to refer to this Costume."""

        if not rotation_center:
            rotation_center = (int(image.width / 2), int(image.height / 2))
        self.rotation_center = tuple(rotation_center)
        """``(x, y)`` position from the top-left corner of the point about
        which the image rotates.

        Defaults to the center of the image.

        """

        self.image = image
        """An :class:`Image` instance containing the raw image data."""

    def copy(self):
        """Return a new instance with the same attributes."""
        return Costume(self.name, self.image, self.rotation_center)

    @classmethod
    def load(self, path):
        """Load costume from image file.

        Uses :attr:`Image.load`, but will set the Costume's name based on the
        image filename.

        """
        (folder, filename) = os.path.split(path)
        (name, extension) = os.path.splitext(filename)
        return Costume(name, Image.load(path))

    def save(self, path):
        """Save the costume to an image file at the given path.

        Uses :attr:`Image.save`, but if the path ends in a folder instead of a
        file, the filename is based on the costume's :attr:`name`.

        The image format is guessed from the extension. If path has no
        extension, the image's :attr:`format` is used.

        :returns: Path to the saved file.

        """
        (folder, filename) = os.path.split(path)
        if not filename:
            filename = _clean_filename(self.name)
            path = os.path.join(folder, filename)
        return self.image.save(path)

    def resize(self, size):
        """Resize :attr:`image` in-place."""
        self.image = self.image.resize(size)

    def __repr__(self):
        return "<%s.%s name=%r rotation_center=%d,%d at 0x%X>" % (
            self.__class__.__module__, self.__class__.__name__, self.name,
            self.rotation_center[0], self.rotation_center[1], id(self)
        )

    def __getattr__(self, name):
        if name in ('width', 'height', 'size'):
            return getattr(self.image, name)
        return super(Costume, self).__getattr__(name)


class Image(object):
    """The contents of an image file.

    Constructing from raw file contents::

        Image(file_contents, "JPEG")

    Constructing from a :class:`PIL.Image.Image` instance::

        pil_image = PIL.Image.new("RGBA", (480, 360))
        Image(pil_image)

    Loading from file path::

        Image.load("path/to/image.jpg")

    Images are immutable. If you want to modify an image, get a
    :class:`PIL.Image.Image` instance from :attr:`pil_image`, modify that, and
    use it to construct a new Image. Modifying images in-place may break
    things.

    The reason for having multiple constructors is so that kurt can implement
    lazy loading of image data -- in many cases, a PIL image will never need to
    be created.

    """

    def __init__(self, contents, format=None):
        self._path = None
        self._pil_image = None
        self._contents = None
        self._format = None
        self._size = None
        if isinstance(contents, PIL.Image.Image):
            self._pil_image = contents
        else:
            self._contents = contents
            self._format = Image.image_format(format)

    def __getstate__(self):
        if isinstance(self._pil_image, PIL.Image.Image):
            copy = self.__dict__.copy()
            copy['_pil_image'] = {
                'data': self._pil_image.tobytes(),
                'size': self._pil_image.size,
                'mode': self._pil_image.mode}
            return copy
        return self.__dict__

    def __setstate__(self, data):
        self.__dict__.update(data)
        if self._pil_image:
            self._pil_image = PIL.Image.frombytes(**self._pil_image)

    # Properties

    @property
    def pil_image(self):
        """A :class:`PIL.Image.Image` instance containing the image data."""
        if not self._pil_image:
            if self._format == "SVG":
                raise VectorImageError("can't rasterise vector images")
            self._pil_image = PIL.Image.open(StringIO(self.contents))
        return self._pil_image

    @property
    def contents(self):
        """The raw file contents as a string."""
        if not self._contents:
            if self._path:
                # Read file into memory so we don't run out of file descriptors
                f = open(self._path, "rb")
                self._contents = f.read()
                f.close()
            elif self._pil_image:
                # Write PIL image to string
                f = StringIO()
                self._pil_image.save(f, self.format)
                self._contents = f.getvalue()
        return self._contents

    @property
    def format(self):
        """The format of the image file.

        An uppercase string corresponding to the
        :attr:`PIL.ImageFile.ImageFile.format` attribute.  Valid values include
        ``"JPEG"`` and ``"PNG"``.

        """
        if self._format:
            return self._format
        elif self.pil_image:
            return self.pil_image.format

    @property
    def extension(self):
        """The extension of the image's :attr:`format` when written to file.

        eg ``".png"``

        """
        return Image.image_extension(self.format)

    @property
    def size(self):
        """``(width, height)`` in pixels."""
        if self._size and not self._pil_image:
            return self._size
        else:
            return self.pil_image.size

    @property
    def width(self):
        return self.size[0]

    @property
    def height(self):
        return self.size[1]

    # Methods

    @classmethod
    def load(cls, path):
        """Load image from file."""
        assert os.path.exists(path), "No such file: %r" % path

        (folder, filename) = os.path.split(path)
        (name, extension) = os.path.splitext(filename)

        image = Image(None)
        image._path = path
        image._format = Image.image_format(extension)

        return image

    def convert(self, *formats):
        """Return an Image instance with the first matching format.

        For each format in ``*args``: If the image's :attr:`format` attribute
        is the same as the format, return self, otherwise try the next format.

        If none of the formats match, return a new Image instance with the
        last format.

        """
        for format in formats:
            format = Image.image_format(format)
            if self.format == format:
                return self
        else:
            return self._convert(format)

    def _convert(self, format):
        """Return a new Image instance with the given format.

        Returns self if the format is already the same.

        """
        if self.format == format:
            return self
        else:
            image = Image(self.pil_image)
            image._format = format
            return image

    def save(self, path):
        """Save image to file path.

        The image format is guessed from the extension. If path has no
        extension, the image's :attr:`format` is used.

        :returns: Path to the saved file.

        """
        (folder, filename) = os.path.split(path)
        (name, extension) = os.path.splitext(filename)

        if not name:
            raise ValueError, "name is required"

        if extension:
            format = Image.image_format(extension)
        else:
            format = self.format
            filename = name + self.extension
            path = os.path.join(folder, filename)

        image = self.convert(format)
        if image._contents:
            f = open(path, "wb")
            f.write(image._contents)
            f.close()
        else:
            image.pil_image.save(path, format)

        return path

    @classmethod
    def new(self, size, fill):
        """Return a new Image instance filled with a color."""
        return Image(PIL.Image.new("RGB", size, fill))

    def resize(self, size):
        """Return a new Image instance with the given size."""
        return Image(self.pil_image.resize(size, PIL.Image.ANTIALIAS))

    def paste(self, other):
        """Return a new Image with the given image pasted on top.

        This image will show through transparent areas of the given image.

        """
        r, g, b, alpha = other.pil_image.split()
        pil_image = self.pil_image.copy()
        pil_image.paste(other.pil_image, mask=alpha)
        return kurt.Image(pil_image)

    # Static methods

    @staticmethod
    def image_format(format_or_extension):
        if format_or_extension:
            format = format_or_extension.lstrip(".").upper()
            if format == "JPG":
                format = "JPEG"
            return format

    @staticmethod
    def image_extension(format_or_extension):
        if format_or_extension:
            extension = format_or_extension.lstrip(".").lower()
            if extension == "jpeg":
                extension = "jpg"
            return "." + extension



#-- Sounds --#

class Sound(object):
    """A sound a :class:`Scriptable` can play.

    The raw sound data is stored in :attr:`waveform`.

    """

    def __init__(self, name, waveform):
        self.name = name
        """Name used by scripts to refer to this Sound."""

        self.waveform = waveform
        """A :class:`Waveform` instance containing the raw sound data."""

    def copy(self):
        """Return a new instance with the same attributes."""
        return Sound(self.name, self.waveform)

    @classmethod
    def load(self, path):
        """Load sound from wave file.

        Uses :attr:`Waveform.load`, but will set the Waveform's name based on
        the sound filename.

        """
        (folder, filename) = os.path.split(path)
        (name, extension) = os.path.splitext(filename)
        return Sound(name, Waveform.load(path))

    def save(self, path):
        """Save the sound to a wave file at the given path.

        Uses :attr:`Waveform.save`, but if the path ends in a folder instead of
        a file, the filename is based on the project's :attr:`name`.

        :returns: Path to the saved file.

        """
        (folder, filename) = os.path.split(path)
        if not filename:
            filename = _clean_filename(self.name)
            path = os.path.join(folder, filename)
        return self.waveform.save(path)

    def __repr__(self):
        return "<%s.%s name=%r at 0x%X>" % (self.__class__.__module__,
                self.__class__.__name__, self.name, id(self))


class Waveform(object):
    """The contents of a wave file. Only WAV format files are supported.

    Constructing from raw file contents::

        Sound(file_contents)

    Loading from file path::

        Sound.load("path/to/sound.wav")

    Waveforms are immutable.

    """

    extension = ".wav"

    def __init__(self, contents, rate=None, sample_count=None):
        self._path = None
        self._contents = contents

        self._rate = rate
        self._sample_count = sample_count

    # Properties

    @property
    def contents(self):
        """The raw file contents as a string."""
        if not self._contents:
            if self._path:
                # Read file into memory so we don't run out of file descriptors
                f = open(self._path, "rb")
                self._contents = f.read()
                f.close()
        return self._contents

    @property
    def _wave(self):
        """Return a wave.Wave_read instance from the ``wave`` module."""
        try:
            return wave.open(StringIO(self.contents))
        except wave.Error, err:
            err.message += "\nInvalid wave file: %s" % self
            err.args = (err.message,)
            raise

    @property
    def rate(self):
        """The sampling rate of the sound."""
        if self._rate:
            return self._rate
        else:
            return self._wave.getframerate()

    @property
    def sample_count(self):
        """The number of samples in the sound."""
        if self._sample_count:
            return self._sample_count
        else:
            return self._wave.getnframes()


    # Methods

    @classmethod
    def load(cls, path):
        """Load Waveform from file."""
        assert os.path.exists(path), "No such file: %r" % path

        (folder, filename) = os.path.split(path)
        (name, extension) = os.path.splitext(filename)

        wave = Waveform(None)
        wave._path = path
        return wave

    def save(self, path):
        """Save waveform to file path as a WAV file.

        :returns: Path to the saved file.

        """
        (folder, filename) = os.path.split(path)
        (name, extension) = os.path.splitext(filename)

        if not name:
            raise ValueError, "name is required"

        path = os.path.join(folder, name + self.extension)
        f = open(path, "wb")
        f.write(self.contents)
        f.close()

        return path



#-- Import submodules --#

import kurt.plugin
import kurt.text

import kurt.scratch20
import kurt.scratch14

